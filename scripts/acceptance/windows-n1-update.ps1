[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("setup", "portable")]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^v\d+\.\d+\.\d+$")]
  [string]$BaseTag,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^v\d+\.\d+\.\d+$")]
  [string]$TargetTag
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repository = "Luis-Herry/bandi"
$baseVersion = $BaseTag.Substring(1)
$targetVersion = $TargetTag.Substring(1)
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$cdpClient = Join-Path $PSScriptRoot "cdp-client.mjs"
$root = Join-Path $env:RUNNER_TEMP ("bandi-n1-{0}-{1}" -f $Mode, [Guid]::NewGuid().ToString("N"))
$assetRoot = Join-Path $root "assets"
$baseAssetRoot = Join-Path $assetRoot "base"
$targetAssetRoot = Join-Path $assetRoot "target"
$installDir = Join-Path $root "Installed"
$downloadDir = Join-Path $root "Media"
$originalUserProfile = $env:USERPROFILE
$recordedPids = [System.Collections.Generic.HashSet[int]]::new()

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Invoke-GhJson {
  param([string[]]$Arguments)
  $output = & gh @Arguments
  if ($LASTEXITCODE -ne 0) { throw "GitHub request failed" }
  return ($output | Out-String | ConvertFrom-Json)
}

function Invoke-CdpJson {
  param([string]$Command, [int]$Port, [string[]]$Arguments = @())
  $output = & node $cdpClient $Command ([string]$Port) @Arguments
  if ($LASTEXITCODE -ne 0) { throw "CDP command failed: $Command" }
  return ($output | Out-String | ConvertFrom-Json)
}

function Invoke-InitialCdpState {
  param(
    [int]$Port,
    [int]$LauncherPid,
    [string]$LeaseFile,
    [string]$AppDataRoot,
    [string]$ConfigFile,
    [string]$PreparedConfigHash,
    [int]$PageTimeoutMs = 180000
  )
  try {
    return Invoke-CdpJson "state" $Port @([string]$PageTimeoutMs)
  } catch {
    $launcherAlive = [bool](Get-Process -Id $LauncherPid -ErrorAction SilentlyContinue)
    $leaseHealthy = [bool](Get-LeaseState $LeaseFile)
    $leaseFileCount = @(Get-ChildItem -LiteralPath $AppDataRoot -Recurse -File -Filter "parent-lease.json" -ErrorAction SilentlyContinue).Count
    $configFileCount = @(Get-ChildItem -LiteralPath $AppDataRoot -Recurse -File -Filter "config.json" -ErrorAction SilentlyContinue).Count
    $desktopErrorLogCount = @(Get-ChildItem -LiteralPath $AppDataRoot -Recurse -File -Filter "desktop.err.log" -ErrorAction SilentlyContinue).Count
    $configTouched = if (Test-Path -LiteralPath $ConfigFile -PathType Leaf) {
      (Get-FileHash -LiteralPath $ConfigFile -Algorithm SHA256).Hash -ne $PreparedConfigHash
    } else {
      $false
    }
    $hasRemoteDebug = $false
    $hasUserDataDir = $false
    $hasHeadless = $false
    $childCount = -1
    try {
      $launcherProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $LauncherPid" -ErrorAction Stop
      $commandLine = [string]$launcherProcess.CommandLine
      $hasRemoteDebug = $commandLine.Contains("--remote-debugging-port=")
      $hasUserDataDir = $commandLine.Contains("--user-data-dir=")
      $hasHeadless = $commandLine.Contains("--headless")
      $childCount = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $LauncherPid" -ErrorAction SilentlyContinue).Count
    } catch {}
    throw "CDP state unavailable; launcherAlive=$launcherAlive; leaseHealthy=$leaseHealthy; leaseFileCount=$leaseFileCount; configFileCount=$configFileCount; desktopErrorLogCount=$desktopErrorLogCount; configTouched=$configTouched; hasRemoteDebug=$hasRemoteDebug; hasUserDataDir=$hasUserDataDir; hasHeadless=$hasHeadless; childCount=$childCount"
  }
}

function Get-ReleaseChecksum {
  param([string]$ChecksumFile, [string]$FileName)
  $pattern = "^([0-9a-f]{64})\s+" + [Regex]::Escape($FileName) + "$"
  $matches = @(Get-Content -LiteralPath $ChecksumFile -Encoding UTF8 | Where-Object { $_ -match $pattern })
  Assert-True ($matches.Count -eq 1) "Expected exactly one checksum for $FileName"
  [void]($matches[0] -match $pattern)
  return $Matches[1]
}

function Wait-For {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds,
    [string]$FailureMessage,
    [int]$IntervalMilliseconds = 1000
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $value = & $Condition
    if ($null -ne $value -and $value -ne $false) { return $value }
    Start-Sleep -Milliseconds $IntervalMilliseconds
  } while ((Get-Date) -lt $deadline)
  throw $FailureMessage
}

function Get-LeaseState {
  param(
    [string]$LeaseFile,
    [int64]$NotBeforeMs = 0,
    [int]$MaxAgeSeconds = 30
  )
  if (-not (Test-Path -LiteralPath $LeaseFile)) { return $null }
  try {
    $lease = Get-Content -LiteralPath $LeaseFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $pidValue = [int]$lease.pid
    $updatedAt = [int64]$lease.updatedAt
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if (
      $pidValue -le 0 -or
      $updatedAt -le 0 -or
      $updatedAt -lt $NotBeforeMs -or
      $updatedAt -gt ($now + 5000) -or
      ($now - $updatedAt) -gt ([int64]$MaxAgeSeconds * 1000)
    ) { return $null }
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    return [pscustomobject]@{ pid = $pidValue; updatedAt = $updatedAt }
  } catch {
    return $null
  }
}

function Get-ConfigProjection {
  param([string]$ConfigFile)
  $config = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
  return [ordered]@{
    appUser = [string]$config.appUser
    downloadDir = [string]$config.downloadDir
    closeToTray = [bool]$config.closeToTray
    onboardingVersion = [int]$config.onboardingVersion
  }
}

function Test-ProductVersion {
  param([string]$File, [string]$ExpectedVersion)
  $expected = [Version]$ExpectedVersion
  $actual = (Get-Item -LiteralPath $File).VersionInfo
  return (
    $actual.ProductMajorPart -eq $expected.Major -and
    $actual.ProductMinorPart -eq $expected.Minor -and
    $actual.ProductBuildPart -eq $expected.Build -and
    $actual.ProductPrivatePart -eq 0
  )
}

function Stop-RecordedProcesses {
  foreach ($processId in $recordedPids) {
    if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
      & taskkill.exe /PID ([string]$processId) /T /F *> $null
    }
  }
}

function Clear-ChildSensitiveEnvironment {
  foreach ($name in @(
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "ACTIONS_RUNTIME_TOKEN",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN"
  )) {
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
  }
}

try {
  New-Item -ItemType Directory -Path $baseAssetRoot, $targetAssetRoot, $downloadDir -Force | Out-Null

  $baseRelease = Invoke-GhJson @("api", "repos/$repository/releases/tags/$BaseTag")
  $targetRelease = Invoke-GhJson @("api", "repos/$repository/releases/tags/$TargetTag")
  $latestRelease = Invoke-GhJson @("api", "repos/$repository/releases/latest")
  Assert-True (-not [bool]$baseRelease.draft -and -not [bool]$baseRelease.prerelease) "Base Release must be public and stable"
  Assert-True (-not [bool]$targetRelease.draft -and -not [bool]$targetRelease.prerelease) "Target Release must be public and stable"
  Assert-True ([string]$latestRelease.tag_name -eq $TargetTag) "Target Release is not the public latest"

  $baseFile = if ($Mode -eq "setup") {
    "Bandi-Setup-$baseVersion-x64.exe"
  } else {
    "Bandi-$baseVersion-x64-portable.exe"
  }
  $targetFile = if ($Mode -eq "setup") {
    "Bandi-Setup-$targetVersion-x64.exe"
  } else {
    "Bandi-$targetVersion-x64-portable.exe"
  }

  $pinnedBaseChecksums = @{
    "setup:v0.1.6" = "8dc6d7ec4e3e2793b3af3a4879623b1413523d45c3f6581744998fa8a273079f"
    "portable:v0.1.6" = "64f7b4f93475cfa776d520b270c0ce96cb98a29ee59c3e36aa10338c819fc3e9"
  }
  $baseKey = "$Mode`:$BaseTag"
  Assert-True ($pinnedBaseChecksums.ContainsKey($baseKey)) "The requested N-1 baseline is not pinned"

  & gh release download $BaseTag --repo $repository --pattern $baseFile --pattern "SHA256SUMS.txt" --dir $baseAssetRoot
  if ($LASTEXITCODE -ne 0) { throw "Base Release download failed" }
  & gh release download $TargetTag --repo $repository --pattern "SHA256SUMS.txt" --dir $targetAssetRoot
  if ($LASTEXITCODE -ne 0) { throw "Target checksum download failed" }

  $basePackage = Join-Path $baseAssetRoot $baseFile
  $baseChecksum = Get-ReleaseChecksum (Join-Path $baseAssetRoot "SHA256SUMS.txt") $baseFile
  $targetChecksum = Get-ReleaseChecksum (Join-Path $targetAssetRoot "SHA256SUMS.txt") $targetFile
  Assert-True ($baseChecksum -eq $pinnedBaseChecksums[$baseKey]) "Base Release checksum does not match the pinned value"
  Assert-True ((Get-FileHash -LiteralPath $basePackage -Algorithm SHA256).Hash.ToLowerInvariant() -eq $baseChecksum) "Downloaded baseline failed SHA-256 verification"

  $targetAssets = @($targetRelease.assets | Where-Object { $_.name -eq $targetFile })
  Assert-True ($targetAssets.Count -eq 1) "Target Release must contain exactly one expected Windows package"
  Assert-True ([string]$targetAssets[0].digest -eq "sha256:$targetChecksum") "Target Release digest does not match SHA256SUMS"

  Clear-ChildSensitiveEnvironment

  $env:APPDATA = Join-Path $root "AppData\Roaming"
  $env:LOCALAPPDATA = Join-Path $root "AppData\Local"
  $env:USERPROFILE = Join-Path $root "Profile"
  $profileDirectories = @($env:APPDATA, $env:LOCALAPPDATA, $env:USERPROFILE)
  foreach ($knownFolder in @("Desktop", "Documents", "Downloads", "Music", "Pictures", "Videos")) {
    $profileDirectories += Join-Path $env:USERPROFILE $knownFolder
  }
  New-Item -ItemType Directory -Path $profileDirectories -Force | Out-Null

  $userData = Join-Path $env:APPDATA "anime-tracker"
  $configFile = Join-Path $userData "config.json"
  $leaseFile = Join-Path $userData "runtime\parent-lease.json"
  New-Item -ItemType Directory -Path $userData -Force | Out-Null
  $sentinelUser = "ci-n1-" + [Guid]::NewGuid().ToString("N")
  $sentinelContent = [Guid]::NewGuid().ToString("N")
  $config = [ordered]@{
    authSecret = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
    appUser = $sentinelUser
    qbitUser = "admin"
    qbitPassword = [Guid]::NewGuid().ToString("N")
    qbitPort = 18180
    downloadDir = $downloadDir
    closeToTray = $false
    onboardingVersion = 1
    onboardingMode = "new"
  }
  $config | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $userData "n1-sentinel.txt") -Value $sentinelContent -Encoding UTF8
  $preparedConfigHash = (Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash

  if ($Mode -eq "setup") {
    $installer = Start-Process -FilePath $basePackage -ArgumentList @("/S", "/currentuser", "/D=$installDir") -PassThru -Wait
    Assert-True ($installer.ExitCode -eq 0) "Silent baseline installation failed"
    $appPath = Join-Path $installDir "追番中心.exe"
  } else {
    $appPath = $basePackage
  }
  Assert-True (Test-Path -LiteralPath $appPath -PathType Leaf) "Baseline executable is missing"
  Assert-True (Test-ProductVersion $appPath $baseVersion) "Baseline ProductVersion is incorrect"

  $port = Get-Random -Minimum 43000 -Maximum 49000
  $launchArguments = @(
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=$port",
    "--user-data-dir=$userData",
    "--headless",
    "--no-sandbox",
    "--disable-gpu"
  )
  $baselineLaunchAfter = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $launcher = Start-Process -FilePath $appPath -ArgumentList $launchArguments -PassThru
  [void]$recordedPids.Add([int]$launcher.Id)

  $initialPageTimeoutMs = if ($Mode -eq "portable") { 600000 } else { 180000 }
  $initialState = Invoke-InitialCdpState $port ([int]$launcher.Id) $leaseFile $env:APPDATA $configFile $preparedConfigHash $initialPageTimeoutMs
  $expectedMode = if ($Mode -eq "setup") { "nsis" } else { "portable" }
  $expectedAction = if ($Mode -eq "setup") { "restart-to-install" } else { "install-portable" }
  Assert-True ([string]$initialState.mode -eq $expectedMode) "Baseline update mode is incorrect"
  Assert-True ([string]$initialState.currentVersion -eq $baseVersion) "Baseline bridge version is incorrect"

  $oldLease = Wait-For { Get-LeaseState $leaseFile $baselineLaunchAfter } 180 "Baseline parent lease did not become healthy"
  $oldPid = [int]$oldLease.pid
  [void]$recordedPids.Add($oldPid)
  Start-Sleep -Seconds 5
  $configHashBefore = (Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash
  $projectionBefore = Get-ConfigProjection $configFile
  Assert-True ($projectionBefore.appUser -eq $sentinelUser) "Synthetic app user was not preserved at baseline"
  Assert-True ($projectionBefore.downloadDir -eq $downloadDir) "Synthetic download directory was not preserved at baseline"

  [void](Invoke-CdpJson "trigger-check" $port)
  $readyState = Invoke-CdpJson "wait-state" $port @("ready", $targetVersion, "1200000")
  Assert-True ([string]$readyState.action -eq $expectedAction) "Ready action is incorrect"
  Assert-True ([int]$readyState.progressPercent -eq 100) "Update download did not reach 100 percent"

  $expectedLabel = if ($Mode -eq "setup") { "重启并更新" } else { "退出并运行新版" }
  foreach ($pathname in @("/", "/settings", "/admin/downloads")) {
    [void](Invoke-CdpJson "navigate" $port @($pathname))
    $notice = Invoke-CdpJson "notice" $port @($expectedLabel)
    Assert-True ([bool]$notice.found -and [bool]$notice.buttonMatches -and [bool]$notice.positionFixed) "Global update notice failed on $pathname"
  }

  $searchRoots = @($root)
  if ($originalUserProfile) { $searchRoots += (Join-Path $originalUserProfile "Downloads\Bandi Updates") }
  $downloadedCandidates = @()
  foreach ($searchRoot in $searchRoots | Select-Object -Unique) {
    if (Test-Path -LiteralPath $searchRoot) {
      $downloadedCandidates += @(Get-ChildItem -LiteralPath $searchRoot -Recurse -File -Filter $targetFile -ErrorAction SilentlyContinue)
    }
  }
  $downloadedCandidates = @($downloadedCandidates | Sort-Object FullName -Unique)
  Assert-True ($downloadedCandidates.Count -eq 1) "Expected exactly one downloaded target package"
  $downloadedPackage = $downloadedCandidates[0].FullName
  Assert-True ((Get-FileHash -LiteralPath $downloadedPackage -Algorithm SHA256).Hash.ToLowerInvariant() -eq $targetChecksum) "Updater-downloaded package failed SHA-256 verification"
  Assert-True ((Get-Item -LiteralPath $downloadedPackage).VersionInfo.ProductVersion -eq $targetVersion) "Updater-downloaded package version is incorrect"

  Start-Sleep -Seconds 60
  Assert-True ([bool](Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) "Baseline exited before the user accepted the update"
  $stillReady = Invoke-CdpJson "state" $port
  Assert-True ([string]$stillReady.status -eq "ready" -and [string]$stillReady.action -eq $expectedAction) "Ready update state did not remain stable"

  $installAcceptedAfter = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  [void](Invoke-CdpJson "trigger-install" $port)
  [void](Wait-For { if (-not (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) { return $true }; return $null } 180 "Baseline process did not exit after accepting the update")
  $relaunchTimeoutSeconds = if ($Mode -eq "portable") { 900 } else { 300 }
  $newLease = Wait-For {
    $candidate = Get-LeaseState $leaseFile $installAcceptedAfter
    if ($candidate -and [int]$candidate.pid -ne $oldPid) { return $candidate }
    return $null
  } $relaunchTimeoutSeconds "Updated app did not create a new healthy parent lease"
  $newPid = [int]$newLease.pid
  [void]$recordedPids.Add($newPid)

  if ($Mode -eq "setup") {
    Assert-True (Test-ProductVersion $appPath $targetVersion) "Installed executable was not updated"
  } else {
    $appPath = $downloadedPackage
  }
  $newProcess = Get-Process -Id $newPid -ErrorAction Stop
  Assert-True ([bool]$newProcess.Path -and (Test-ProductVersion $newProcess.Path $targetVersion)) "Automatically started process is not the target version"
  $firstLeaseTimestamp = [int64]$newLease.updatedAt
  Start-Sleep -Seconds 15
  $stableLease = Get-LeaseState $leaseFile
  Assert-True ($stableLease -and [int]$stableLease.pid -eq $newPid -and [int64]$stableLease.updatedAt -gt $firstLeaseTimestamp) "Automatically started target was not stable"

  $configHashAfter = (Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash
  $projectionAfter = Get-ConfigProjection $configFile
  Assert-True ($configHashAfter -eq $configHashBefore) "Desktop config changed during the update"
  Assert-True (($projectionAfter | ConvertTo-Json -Compress) -eq ($projectionBefore | ConvertTo-Json -Compress)) "Desktop config projection changed during the update"
  Assert-True ((Get-Content -LiteralPath (Join-Path $userData "n1-sentinel.txt") -Raw -Encoding UTF8).Trim() -eq $sentinelContent) "User-data sentinel was not preserved"

  $autoProcess = Get-Process -Id $newPid -ErrorAction Stop
  Assert-True ($autoProcess.CloseMainWindow()) "Updated app window could not close normally"
  [void](Wait-For { if (-not (Get-Process -Id $newPid -ErrorAction SilentlyContinue)) { return $true }; return $null } 180 "Automatically started target did not close normally")

  $verifyPort = Get-Random -Minimum 50000 -Maximum 56000
  $verifyConfigHash = (Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash
  $verifyLaunchAfter = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $verifyLauncher = Start-Process -FilePath $appPath -ArgumentList @(
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=$verifyPort",
    "--user-data-dir=$userData",
    "--headless",
    "--no-sandbox",
    "--disable-gpu"
  ) -PassThru
  [void]$recordedPids.Add([int]$verifyLauncher.Id)
  $targetState = Invoke-InitialCdpState $verifyPort ([int]$verifyLauncher.Id) $leaseFile $env:APPDATA $configFile $verifyConfigHash $initialPageTimeoutMs
  $verifyLease = Wait-For {
    $candidate = Get-LeaseState $leaseFile $verifyLaunchAfter
    if ($candidate -and [int]$candidate.pid -ne $newPid) { return $candidate }
    return $null
  } 180 "Controlled target restart did not create a healthy parent lease"
  $verifyPid = [int]$verifyLease.pid
  [void]$recordedPids.Add($verifyPid)
  Assert-True ([string]$targetState.currentVersion -eq $targetVersion) "Controlled target restart reported the wrong version"
  Assert-True ([string]$targetState.mode -eq $expectedMode) "Controlled target restart reported the wrong update mode"
  [void](Invoke-CdpJson "trigger-check" $verifyPort)
  $latestState = Invoke-CdpJson "wait-state" $verifyPort @("up-to-date", "-", "300000")
  Assert-True ([string]$latestState.currentVersion -eq $targetVersion) "Target version did not report up-to-date"
  [void](Invoke-CdpJson "close" $verifyPort)
  [void](Wait-For { if (-not (Get-Process -Id $verifyPid -ErrorAction SilentlyContinue)) { return $true }; return $null } 180 "Controlled target restart did not close normally")

  if ($env:GITHUB_STEP_SUMMARY) {
    @"
### Windows N-1 update acceptance: $Mode

- Base: ``$BaseTag``
- Target/latest: ``$TargetTag``
- Baseline SHA-256 pinned and verified: yes
- Updater download SHA-256 verified: yes
- Global notice verified on 3 pages: yes
- Ready state remained open for 60 seconds: yes
- Old process exited after consent: yes
- Target auto-started and remained healthy: yes
- Config and user-data sentinel preserved: yes
- Controlled target restart reported up-to-date: yes
"@ | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding UTF8
  }
  Write-Output "N1_ACCEPTANCE_MODE=$Mode"
  Write-Output "N1_ACCEPTANCE_BASE=$BaseTag"
  Write-Output "N1_ACCEPTANCE_TARGET=$TargetTag"
  Write-Output "N1_ACCEPTANCE_RESULT=pass"
} finally {
  Stop-RecordedProcesses
}
