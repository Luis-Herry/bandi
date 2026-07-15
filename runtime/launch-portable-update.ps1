param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483647)]
  [int]$WaitForPid,

  [Parameter(Mandatory = $true)]
  [string]$ExecutablePath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-fA-F0-9]{64}$")]
  [string]$ExpectedSha256,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483648)]
  [long]$ExpectedSize
)

$deadline = (Get-Date).AddMinutes(2)
while ((Get-Process -Id $WaitForPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 250
}

if (Get-Process -Id $WaitForPid -ErrorAction SilentlyContinue) {
  exit 2
}

$resolvedExecutable = (Resolve-Path -LiteralPath $ExecutablePath -ErrorAction Stop).Path
if ([IO.Path]::GetExtension($resolvedExecutable) -ne ".exe") {
  exit 3
}

$file = Get-Item -LiteralPath $resolvedExecutable -ErrorAction Stop
if ($file.Length -ne $ExpectedSize) {
  exit 4
}

$actualSha256 = (Get-FileHash -LiteralPath $resolvedExecutable -Algorithm SHA256).Hash
if ($actualSha256 -ine $ExpectedSha256) {
  exit 5
}

Start-Process -FilePath $resolvedExecutable
