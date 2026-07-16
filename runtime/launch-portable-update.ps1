param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483647)]
  [int]$WaitForPid,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483647)]
  [int]$WaitForParentPid,

  [Parameter(Mandatory = $true)]
  [string]$ExecutablePath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-fA-F0-9]{64}$")]
  [string]$ExpectedSha256,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483648)]
  [long]$ExpectedSize,

  [Parameter(Mandatory = $true)]
  [string]$ResultFile
)

function Write-Result {
  param([string]$Code)
  try {
    $directory = Split-Path -Parent $ResultFile
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $payload = [ordered]@{
      code = $Code
      updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($ResultFile, $payload, [Text.UTF8Encoding]::new($false))
  } catch {}
}

function Stop-WithResult {
  param([string]$Code, [int]$ExitCode)
  Write-Result $Code
  exit $ExitCode
}

function Wait-ForRecordedProcess {
  param([System.Diagnostics.Process]$Process, [DateTime]$Deadline)
  if (-not $Process) { return $true }
  $remaining = [Math]::Floor(($Deadline - (Get-Date)).TotalMilliseconds)
  if ($remaining -le 0) { return $false }
  try {
    return $Process.WaitForExit([int][Math]::Min($remaining, [int]::MaxValue))
  } catch {
    return $false
  }
}

$deadline = (Get-Date).AddMinutes(5)
$applicationProcess = Get-Process -Id $WaitForPid -ErrorAction SilentlyContinue
$wrapperProcess = if ($WaitForParentPid -ne $WaitForPid) {
  Get-Process -Id $WaitForParentPid -ErrorAction SilentlyContinue
} else {
  $null
}

if (-not (Wait-ForRecordedProcess $applicationProcess $deadline)) {
  Stop-WithResult "application_exit_timeout" 2
}
if (-not (Wait-ForRecordedProcess $wrapperProcess $deadline)) {
  Stop-WithResult "wrapper_exit_timeout" 3
}

try {
  $resolvedExecutable = (Resolve-Path -LiteralPath $ExecutablePath -ErrorAction Stop).Path
} catch {
  Stop-WithResult "target_missing" 4
}
if ([IO.Path]::GetExtension($resolvedExecutable) -ne ".exe") {
  Stop-WithResult "target_extension_invalid" 5
}

try {
  $file = Get-Item -LiteralPath $resolvedExecutable -ErrorAction Stop
} catch {
  Stop-WithResult "target_missing" 4
}
if ($file.Length -ne $ExpectedSize) {
  Stop-WithResult "target_size_mismatch" 6
}

$actualSha256 = (Get-FileHash -LiteralPath $resolvedExecutable -Algorithm SHA256).Hash
if ($actualSha256 -ine $ExpectedSha256) {
  Stop-WithResult "target_hash_mismatch" 7
}

try {
  $launched = Start-Process -FilePath $resolvedExecutable -PassThru -ErrorAction Stop
} catch {
  Stop-WithResult "target_launch_failed" 8
}
Start-Sleep -Seconds 5
if ($launched.HasExited) {
  Stop-WithResult "target_exited_early" 9
}
Write-Result "target_started"
