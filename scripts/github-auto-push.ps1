param(
  [Parameter(Mandatory=$true)][string]$RepoPath,
  [Parameter(Mandatory=$true)][string]$NodePath,
  [Parameter(Mandatory=$true)][string]$GitPath
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $RepoPath).Path
$state = Join-Path $repo '.github-local'
[IO.Directory]::CreateDirectory($state) | Out-Null
$log = Join-Path $state 'auto-push.log'
$env:PATH = (Split-Path -Parent $NodePath) + ';' + (Split-Path -Parent $GitPath) + ';' + $env:PATH
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'Never'
Set-Location -LiteralPath $repo
if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1048576) {
  Move-Item -LiteralPath $log -Destination (Join-Path $state 'auto-push.previous.log') -Force
}
$ErrorActionPreference = 'Continue'
$output = & $NodePath (Join-Path $repo 'scripts/github-push.mjs') 2>&1
$commandExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($output) {
  ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ']') | Out-File -LiteralPath $log -Append -Encoding utf8
  $output | Out-File -LiteralPath $log -Append -Encoding utf8
}
if ($commandExit -ne 0) { exit $commandExit }
