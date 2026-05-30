$ErrorActionPreference = 'Stop'

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$serverPath = Join-Path $dir 'server.js'
$logPath = Join-Path $dir 'server.log'

$processoExistente = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -match '^node(\.exe)?$' -and
    $_.CommandLine -like "*$serverPath*"
  } |
  Select-Object -First 1

if ($processoExistente) {
  Write-Host 'Servidor ja esta rodando em segundo plano.'
  exit 0
}

$argumentos = @(
  '/c'
  'cd /d "{0}" && "{1}" "{2}" >> "{3}" 2>&1' -f $dir, $nodePath, $serverPath, $logPath
)

Start-Process -FilePath 'cmd.exe' -ArgumentList $argumentos -WindowStyle Hidden
Write-Host 'Servidor iniciado em segundo plano.'