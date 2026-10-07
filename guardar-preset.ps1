<#
  Publica un preset descargado desde la web en el repositorio.

  Uso (desde la carpeta del proyecto):
    .\guardar-preset.ps1 -Archivo "$env:USERPROFILE\Downloads\cena-navidad.json"
    .\guardar-preset.ps1 -Archivo ".\mi-preset.json" -Nombre "Cena de navidad" -Musica ".\musica\navidad.mp3"

  Que hace:
    1. Copia el preset a presets/
    2. Copia el MP3 a musica/ si lo indicas
    3. Anade la entrada al indice presets/index.json
    4. Hace commit y push

  Por que hace falta esto: una web estatica de GitHub Pages no puede escribir
  archivos en el repositorio. El token de GitHub nunca debe ir en el JavaScript
  de la web, porque cualquier visitante podria leerlo y modificar el repositorio.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Archivo,

  [string]$Nombre,
  [string]$Musica,
  [string]$Descripcion
)

$ErrorActionPreference = 'Stop'

$rutaProyecto = Split-Path -Parent $MyInvocation.MyCommand.Path
$rutaPresets = Join-Path $rutaProyecto 'presets'
$rutaMusica = Join-Path $rutaProyecto 'musica'

if (-not (Test-Path -LiteralPath $Archivo)) {
  throw "No se encuentra el archivo: $Archivo"
}

$contenido = Get-Content -LiteralPath $Archivo -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $contenido.options -or $contenido.options.Count -eq 0) {
  throw 'El archivo no contiene opciones.'
}

$nombrePreset = if ($Nombre) { $Nombre } elseif ($contenido.name) { $contenido.name } else { [IO.Path]::GetFileNameWithoutExtension($Archivo) }
$idPreset = ($nombrePreset -replace '[^\w-]+', '-').Trim('-').ToLower()
if (-not $idPreset) { $idPreset = 'preset' }

New-Item -ItemType Directory -Path $rutaPresets -Force | Out-Null

# 1. Copiar el MP3 si se ha indicado, para que el preset quede autocontenido
if ($Musica) {
  if (-not (Test-Path -LiteralPath $Musica)) { throw "No se encuentra el MP3: $Musica" }
  New-Item -ItemType Directory -Path $rutaMusica -Force | Out-Null
  $destinoMusica = Join-Path $rutaMusica ([IO.Path]::GetFileName($Musica))
  Copy-Item -LiteralPath $Musica -Destination $destinoMusica -Force
  $contenido.music = [pscustomobject]@{
    src      = "./musica/$([IO.Path]::GetFileName($Musica))"
    volume   = if ($contenido.music.volume) { $contenido.music.volume } else { 45 }
    autoplay = $true
  }
  Write-Host "Musica copiada a musica/$([IO.Path]::GetFileName($Musica))" -ForegroundColor Cyan
}

# 2. Guardar el preset normalizado
$contenido.name = $nombrePreset
if ($Descripcion) { $contenido.description = $Descripcion }
if (-not $contenido.music) { $contenido.music = [pscustomobject]@{ src = $null; volume = 45; autoplay = $true } }

$rutaPreset = Join-Path $rutaPresets "$idPreset.json"
$json = [pscustomobject]@{
  name        = $contenido.name
  description = if ($contenido.description) { $contenido.description } else { "$($contenido.options.Count) opciones" }
  options     = @($contenido.options | ForEach-Object {
    [pscustomobject]@{
      id    = if ($_.id) { $_.id } else { "$idPreset-$([guid]::NewGuid().ToString('N').Substring(0,8))" }
      name  = $_.name
      image = if ($_.image) { $_.image } else { '' }
    }
  })
  music       = $contenido.music
} | ConvertTo-Json -Depth 10

Set-Content -LiteralPath $rutaPreset -Value $json -Encoding UTF8
Write-Host "Preset escrito en presets/$idPreset.json ($($contenido.options.Count) opciones)" -ForegroundColor Green

# 3. Actualizar el indice
$rutaIndice = Join-Path $rutaPresets 'index.json'
$indice = if (Test-Path -LiteralPath $rutaIndice) {
  Get-Content -LiteralPath $rutaIndice -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
  [pscustomobject]@{ presets = @() }
}
if (-not $indice.presets) { $indice | Add-Member -NotePropertyName presets -NotePropertyValue @() -Force }

$entrada = [pscustomobject]@{
  id          = $idPreset
  name        = $nombrePreset
  description = if ($contenido.description) { $contenido.description } else { "$($contenido.options.Count) opciones" }
  file        = "$idPreset.json"
  options     = @($contenido.options).Count
}

$resto = @($indice.presets | Where-Object { $_.id -ne $idPreset })
$indice.presets = @($resto + $entrada)
Set-Content -LiteralPath $rutaIndice -Value ($indice | ConvertTo-Json -Depth 10) -Encoding UTF8
Write-Host "Indice actualizado con $idPreset" -ForegroundColor Green

# 4. Commit y push
Push-Location $rutaProyecto
try {
  git add --all
  git commit -m "Preset: $nombrePreset"
  git push
  Write-Host "Publicado. GitHub Pages lo mostrara en unos segundos." -ForegroundColor Cyan
} finally {
  Pop-Location
}
