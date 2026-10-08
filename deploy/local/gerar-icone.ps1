# Gera offensive.ico (ícone do OffensiveTunel.exe e da bandeja) desenhando a
# mira do public/icon.svg — o System.Drawing não lê SVG. Um PNG por tamanho
# dentro do .ico (formato aceito desde o Windows Vista).
# Uso: powershell -ExecutionPolicy Bypass -File deploy\local\gerar-icone.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path

function Desenhar([int]$t) {
    $bmp = New-Object Drawing.Bitmap $t, $t
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([Drawing.Color]::Transparent)
    $e = $t / 512.0
    # Fundo roxo com cantos arredondados (rx=96).
    $r = 96 * $e * 2
    $fundo = New-Object Drawing.Drawing2D.GraphicsPath
    $fundo.AddArc(0, 0, $r, $r, 180, 90)
    $fundo.AddArc($t - $r, 0, $r, $r, 270, 90)
    $fundo.AddArc($t - $r, $t - $r, $r, $r, 0, 90)
    $fundo.AddArc(0, $t - $r, $r, $r, 90, 90)
    $fundo.CloseFigure()
    $g.FillPath((New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#4b2a9a'))), $fundo)
    $laranja = [Drawing.ColorTranslator]::FromHtml('#ff8a1f')
    # Anel (r=150, traço 40) e centro (r=40).
    $g.DrawEllipse((New-Object Drawing.Pen $laranja, (40 * $e)), (106 * $e), (106 * $e), (300 * $e), (300 * $e))
    $g.FillEllipse((New-Object Drawing.SolidBrush $laranja), (216 * $e), (216 * $e), (80 * $e), (80 * $e))
    # As quatro hastes (traço 28, pontas redondas).
    $haste = New-Object Drawing.Pen ([Drawing.ColorTranslator]::FromHtml('#f3efe6')), (28 * $e)
    $haste.StartCap = 'Round'; $haste.EndCap = 'Round'
    $g.DrawLine($haste, 256 * $e, 60 * $e, 256 * $e, 160 * $e)
    $g.DrawLine($haste, 256 * $e, 352 * $e, 256 * $e, 452 * $e)
    $g.DrawLine($haste, 60 * $e, 256 * $e, 160 * $e, 256 * $e)
    $g.DrawLine($haste, 352 * $e, 256 * $e, 452 * $e, 256 * $e)
    $g.Dispose()
    $ms = New-Object IO.MemoryStream
    if ($t -ge 256) {
        $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
    } else {
        # Até 64 px, DIB de 32 bits (BGRA, de baixo para cima) + máscara AND:
        # o System.Drawing do .NET Framework (a bandeja) não lê PNG nesses tamanhos.
        $bw = New-Object IO.BinaryWriter $ms
        $bw.Write([uint32]40); $bw.Write([int32]$t); $bw.Write([int32]($t * 2))
        $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]0)
        $bw.Write([uint32]0); $bw.Write([int32]0); $bw.Write([int32]0); $bw.Write([uint32]0); $bw.Write([uint32]0)
        for ($y = $t - 1; $y -ge 0; $y--) {
            for ($x = 0; $x -lt $t; $x++) {
                $c = $bmp.GetPixel($x, $y)
                $bw.Write([byte]$c.B); $bw.Write([byte]$c.G); $bw.Write([byte]$c.R); $bw.Write([byte]$c.A)
            }
        }
        # Máscara AND zerada (o alfa já recorta): linhas de 1 bit alinhadas a 32 bits.
        $linha = [int]([math]::Ceiling($t / 32.0) * 4)
        $bw.Write((New-Object byte[] ($linha * $t)))
        $bw.Flush()
    }
    $bmp.Dispose()
    return ,$ms.ToArray()
}

$tamanhos = @(16, 24, 32, 48, 64, 256)
$pngs = @($tamanhos | ForEach-Object { ,(Desenhar $_) })
$saida = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $saida
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$tamanhos.Count)
$deslocamento = 6 + 16 * $tamanhos.Count
for ($i = 0; $i -lt $tamanhos.Count; $i++) {
    $t = $tamanhos[$i]
    $lado = if ($t -ge 256) { 0 } else { $t }   # 0 = 256 no formato ICO
    $w.Write([byte]$lado); $w.Write([byte]$lado); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([uint16]1); $w.Write([uint16]32)
    $w.Write([uint32]$pngs[$i].Length); $w.Write([uint32]$deslocamento)
    $deslocamento += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush()
[IO.File]::WriteAllBytes((Join-Path $aqui 'offensive.ico'), $saida.ToArray())
Write-Host "ok: $(Join-Path $aqui 'offensive.ico')"
