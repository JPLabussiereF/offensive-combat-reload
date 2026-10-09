# Configuração ÚNICA do Cloudflare Tunnel para o Offensive Combat.
#
# Antes: o domínio (trybest.com.br) já está na conta Cloudflare — é o mesmo da
# TryBest. Este PC precisa do cloudflared instalado (winget install Cloudflare.cloudflared).
#
# Produção: túnel `offensive-combat`, com offensive-combat.<domínio> (o jogo) e
# games.<domínio> (a lista de jogos). Grava credentials.json e cloudflared.yml
# em %USERPROFILE%\.offensive-prd, que o container do cloudflared monta em
# modo leitura.
#   powershell -ExecutionPolicy Bypass -File deploy\local\configurar-cloudflare.ps1
#
# Homologação: túnel `offensive-combat-hml`, offensive-combat-hml.<domínio>,
# arquivos em %USERPROFILE%\.offensive-hml — nada da produção é tocado.
#   powershell -ExecutionPolicy Bypass -File deploy\local\configurar-cloudflare.ps1 -Homologacao
#
# Se games.<domínio> já apontava para outro túnel (o da TryBest), o
# --overwrite-dns troca o CNAME para este.
param(
    [string]$Dominio = 'trybest.com.br',
    [switch]$Homologacao
)
$ErrorActionPreference = 'Stop'
if ($Homologacao) {
    $Tunel = 'offensive-combat-hml'
    $Pasta = Join-Path $env:USERPROFILE '.offensive-hml'
    $hostJogo = "offensive-combat-hml.$Dominio"
    $nomes = @($hostJogo)
} else {
    $Tunel = 'offensive-combat'
    $Pasta = Join-Path $env:USERPROFILE '.offensive-prd'
    $hostJogo = "offensive-combat.$Dominio"
    $nomes = @($hostJogo, "games.$Dominio")
}
New-Item -ItemType Directory -Force $Pasta | Out-Null
$cf = (Get-Command cloudflared -ErrorAction Stop).Source
$pastaCf = Join-Path $env:USERPROFILE '.cloudflared'

# 1. Login: abre o navegador para autorizar a zona do domínio.
if (-not (Test-Path (Join-Path $pastaCf 'cert.pem'))) {
    Write-Host '>> Autorize o dominio no navegador que vai abrir...'
    & $cf tunnel login
    if ($LASTEXITCODE -ne 0) { throw 'login falhou' }
}

# 2. Túnel nomeado (idempotente: reaproveita se já existir).
$existente = (& $cf tunnel list --output json | ConvertFrom-Json) | Where-Object { $_.name -eq $Tunel }
if (-not $existente) {
    & $cf tunnel create $Tunel
    if ($LASTEXITCODE -ne 0) { throw 'criar o tunel falhou' }
    $existente = (& $cf tunnel list --output json | ConvertFrom-Json) | Where-Object { $_.name -eq $Tunel }
}
$id = $existente.id
$credenciais = Join-Path $pastaCf "$id.json"
if (-not (Test-Path $credenciais)) { throw "credenciais do tunel nao encontradas: $credenciais" }

# 3. DNS: CNAME de cada nome para o túnel. ⚠️ O --overwrite-dns só substitui
#    CNAME; um registro A/AAAA no mesmo nome bloqueia (código 1003) e precisa
#    ser apagado à mão em Cloudflare > DNS > Records.
foreach ($h in $nomes) {
    & $cf tunnel route dns --overwrite-dns $Tunel $h
    if ($LASTEXITCODE -ne 0) {
        throw ("DNS de $h falhou. Se o erro foi 'record with that host already exists', " +
               "apague os registros A/AAAA de $h em Cloudflare > DNS > Records e rode de novo.")
    }
}

# 4. Configuração que o container do cloudflared usa. Os serviços são os nomes
#    da rede do Docker (web, portal) — nada passa por porta do host.
#    UTF-8 sem BOM: o YAML do cloudflared não aceita o BOM do PowerShell 5.
Copy-Item -Force $credenciais (Join-Path $Pasta 'credentials.json')
$portal = ''
if (-not $Homologacao) {
    $portal = @"

  - hostname: games.$Dominio
    service: http://portal:80
"@
}
$yml = @"
tunnel: $id
credentials-file: /etc/cloudflared/credentials.json
ingress:
  - hostname: $hostJogo
    service: http://web:80$portal
  - service: http_status:404
"@
$destino = Join-Path $Pasta 'cloudflared.yml'
[IO.File]::WriteAllText($destino, $yml, (New-Object Text.UTF8Encoding $false))
# `--config` vem ANTES de `ingress validate` (é flag do `tunnel`).
& $cf tunnel --config $destino ingress validate
if ($LASTEXITCODE -ne 0) { throw "cloudflared.yml invalido: $destino" }
Write-Host "ok: $destino"
