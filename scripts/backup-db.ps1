<#
.SYNOPSIS
  Copia de seguridad completa de la base de datos Supabase: estructura y datos.

.DESCRIPTION
  `supabase db dump` vuelca solo la estructura por defecto, así que este script
  lanza los dos volcados que hacen falta para tener una copia restaurable.

  La referencia del proyecto se saca de .env.local si está; la contraseña se
  pide por teclado y no se guarda en ningún sitio.

.PARAMETER Ref
  Referencia del proyecto (Project Settings → General → Reference ID).
  Si no se pasa, se intenta leer de .env.local.

.PARAMETER DbUrl
  Cadena de conexión completa, como alternativa a Ref + contraseña. Úsala si la
  conexión directa falla por red: copia la del "Session pooler" del dashboard
  (Project Settings → Database → Connection string), que va por IPv4.

.PARAMETER OutDir
  Carpeta de salida. Por defecto "backups", que está en .gitignore.

.EXAMPLE
  .\scripts\backup-db.ps1

.EXAMPLE
  .\scripts\backup-db.ps1 -DbUrl "postgresql://postgres.abc:PASS@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
#>
param(
  [string]$Ref,
  [string]$DbUrl,
  [string]$OutDir = "backups"
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

if (-not $DbUrl) {

  if (-not $Ref) {
    $envFile = Join-Path $raiz ".env.local"
    if (Test-Path $envFile) {
      $m = Select-String -Path $envFile -Pattern 'https://([a-z0-9]+)\.supabase\.co'
      if ($m) {
        $Ref = $m.Matches[0].Groups[1].Value
        Write-Host "Proyecto detectado en .env.local: $Ref" -ForegroundColor DarkGray
      }
    }
  }
  if (-not $Ref) {
    $Ref = Read-Host "Referencia del proyecto (Project Settings -> General -> Reference ID)"
  }
  if (-not $Ref) { throw "Hace falta la referencia del proyecto." }

  Write-Host "Contraseña de la base de datos: Project Settings -> Database." -ForegroundColor DarkGray
  Write-Host "No es la anon key. No se muestra al escribirla." -ForegroundColor DarkGray
  $secure = Read-Host "Contraseña" -AsSecureString

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try   { $pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if (-not $pass) { throw "Sin contraseña no se puede continuar." }

  # Escapada por si la contraseña lleva caracteres con significado en una URL
  $DbUrl = "postgresql://postgres:$([uri]::EscapeDataString($pass))@db.$Ref.supabase.co:5432/postgres"
}

$destino = Join-Path $raiz $OutDir
if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }

$sello        = Get-Date -Format 'yyyy-MM-dd'
$fEstructura  = Join-Path $destino "$sello-estructura.sql"
$fDatos       = Join-Path $destino "$sello-datos.sql"

$pistaRed = @"

Si el error es de conexión, es probable que sea IPv6: la conexión directa de
Supabase no siempre es alcanzable. Coge la cadena del "Session pooler" en
Project Settings -> Database y reintenta con:

  .\scripts\backup-db.ps1 -DbUrl "<cadena del pooler>"
"@

Write-Host "`nVolcando estructura..." -ForegroundColor Cyan
npx --yes supabase db dump --db-url $DbUrl -f $fEstructura
if ($LASTEXITCODE -ne 0) { throw "Falló el volcado de estructura.$pistaRed" }

Write-Host "`nVolcando datos..." -ForegroundColor Cyan
npx --yes supabase db dump --data-only --db-url $DbUrl -f $fDatos
if ($LASTEXITCODE -ne 0) { throw "Falló el volcado de datos.$pistaRed" }

Write-Host "`nListo:" -ForegroundColor Green
Get-ChildItem $fEstructura, $fDatos |
  Select-Object Name, @{ n = 'KB'; e = { [math]::Round($_.Length / 1KB, 1) } } |
  Format-Table -AutoSize

Write-Host "Contienen teléfonos, emails y tokens de participantes reales." -ForegroundColor Yellow
Write-Host "La carpeta '$OutDir' está en .gitignore: no los subas al repositorio." -ForegroundColor Yellow
