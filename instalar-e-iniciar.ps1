# Liga/Desliga Notebook v2 - Configuracao completa
# Execute como Administrador uma unica vez.

param(
  [switch]$SemAutostart
)

$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host '===================================================' -ForegroundColor Cyan
Write-Host '  Liga/Desliga Notebook v2 - Configuracao          ' -ForegroundColor Cyan
Write-Host '===================================================' -ForegroundColor Cyan
Write-Host ''

# --- 1. Node.js ---------------------------------------------------------------
$nodeOk = $false
try {
  $v = & node --version 2>$null
  if ($v) { $nodeOk = $true; Write-Host "Node.js: $v" -ForegroundColor Green }
} catch {}

if (-not $nodeOk) {
  Write-Host 'Instalando Node.js via winget...' -ForegroundColor Yellow
  try {
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path    = "$machinePath;$userPath"
    Write-Host 'Node.js instalado!' -ForegroundColor Green
  } catch {
    Write-Host 'ERRO: instale o Node.js manualmente em https://nodejs.org' -ForegroundColor Red
    Read-Host 'Pressione Enter para sair'
    exit 1
  }
}

# --- 2. Dependencias npm ------------------------------------------------------
Write-Host ''
Write-Host 'Instalando dependencias...' -ForegroundColor Yellow
Set-Location $dir
& npm install
Write-Host 'OK!' -ForegroundColor Green

# --- 3. Cloudflare Tunnel ----------------------------------------------------
Write-Host ''
Write-Host 'Verificando cloudflared para acesso externo...' -ForegroundColor Yellow
$cloudflaredOk = $false
try {
  $cloudflared = & cloudflared version 2>$null
  if ($cloudflared) {
    $cloudflaredOk = $true
    Write-Host 'cloudflared ja esta instalado.' -ForegroundColor Green
  }
} catch {}

if (-not $cloudflaredOk) {
  Write-Host 'Instalando cloudflared via winget...' -ForegroundColor Yellow
  try {
    winget install Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
    Write-Host 'cloudflared instalado!' -ForegroundColor Green
  } catch {
    Write-Host 'Aviso: nao foi possivel instalar cloudflared automaticamente.' -ForegroundColor Yellow
    Write-Host 'Instale manualmente em: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/' -ForegroundColor Yellow
  }
}

# --- 4. Firewall --------------------------------------------------------------
Write-Host ''
Write-Host 'Adicionando regra no Firewall do Windows (porta 3000)...' -ForegroundColor Yellow
try {
  $fwParams = @{
    DisplayName = 'LigaDesligaNotebook'
    Direction   = 'Inbound'
    Protocol    = 'TCP'
    LocalPort   = 3000
    Action      = 'Allow'
    Profile     = 'Any'
    ErrorAction = 'SilentlyContinue'
  }
  New-NetFirewallRule @fwParams | Out-Null
  Write-Host 'Firewall OK!' -ForegroundColor Green
} catch {
  Write-Host 'Aviso: nao foi possivel criar regra de firewall automaticamente.' -ForegroundColor Yellow
  Write-Host 'Crie manualmente: Firewall > Regra de entrada > TCP 3000' -ForegroundColor Yellow
}

# --- 5. Autostart no Windows (Task Scheduler) ---------------------------------
if (-not $SemAutostart) {
  Write-Host ''
  Write-Host 'Registrando inicio automatico com o Windows...' -ForegroundColor Yellow

  $powershellPath = (Get-Command powershell.exe).Source
  $launcherPath = Join-Path $dir 'iniciar-em-segundo-plano.ps1'
  $action   = New-ScheduledTaskAction -Execute $powershellPath -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`""
  $trigger  = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable

  $taskParams = @{
    TaskName  = 'LigaDesligaNotebook'
    Action    = $action
    Trigger   = $trigger
    Settings  = $settings
    RunLevel  = 'Highest'
    Force     = $true
  }
  Register-ScheduledTask @taskParams | Out-Null

  Write-Host 'Tarefa registrada! O servidor iniciara automaticamente com o Windows.' -ForegroundColor Green
  Write-Host 'Para remover: Agendador de Tarefas > LigaDesligaNotebook > Excluir' -ForegroundColor Gray
}

# --- 6. Informacoes da rede ---------------------------------------------------
Write-Host ''
Write-Host '--- IPs disponiveis na rede ---' -ForegroundColor Cyan
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.'
}
foreach ($ip in $ips) {
  Write-Host "  http://$($ip.IPAddress):3000" -ForegroundColor White
}
Write-Host '  IP fixo do notebook: http://192.168.1.29:3000' -ForegroundColor Green

Write-Host ''
Write-Host '--- MAC Address do notebook (para config.js) ---' -ForegroundColor Cyan
Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
  Write-Host "  $($_.Name): $($_.MacAddress)" -ForegroundColor White
}

Write-Host ''
Write-Host '--- Proximos passos ---' -ForegroundColor Cyan
Write-Host '  1. Abra o painel no notebook: http://localhost:3000' -ForegroundColor Yellow
Write-Host '  2. Para acesso externo, use o link do cloudflared exibido no terminal' -ForegroundColor Yellow
Write-Host '  3. Edite config.js: mac_address apenas se o WoL precisar de ajuste' -ForegroundColor Yellow
Write-Host ''

# --- 6. Iniciar servidor ------------------------------------------------------
Write-Host 'Iniciando servidor agora em segundo plano...' -ForegroundColor Green
Write-Host ''
& (Join-Path $dir 'iniciar-em-segundo-plano.ps1')
Write-Host 'Use server.log para ver os logs do servidor.' -ForegroundColor Gray
