# Compila o OffensiveTunel.exe com o csc do .NET Framework (já vem no Windows).
# Uso: powershell -ExecutionPolicy Bypass -File deploy\local\compilar.ps1
#
# ⚠️ Com o .exe aberto o arquivo fica travado: feche pela bandeja ("Parar o
# Offensive Combat") antes, ou o csc não consegue sobrescrever.
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "csc.exe não encontrado em $csc" }
# offensive.ico: a mira do public/icon.svg (gerada por gerar-icone.ps1).
# System.Web.Extensions: o JavaScriptSerializer do historico.json e da fila de deploy.
& $csc /nologo /optimize+ /target:winexe "/out:$aqui\OffensiveTunel.exe" `
    "/win32icon:$aqui\offensive.ico" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll "$aqui\OffensiveTunel.cs"
if ($LASTEXITCODE -ne 0) { throw "compilação falhou" }
Write-Host "ok: $aqui\OffensiveTunel.exe"
