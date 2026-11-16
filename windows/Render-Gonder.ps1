param(
    [Parameter(Mandatory=$true)][string]$ExcelPath,
    [Parameter(Mandatory=$true)][datetime]$StartDate,
    [Parameter(Mandatory=$true)][datetime]$EndDate
)
$ErrorActionPreference = 'Stop'
$panel = [Environment]::GetEnvironmentVariable('DOLULUK_RENDER_URL','User')
$token = [Environment]::GetEnvironmentVariable('DOLULUK_INGEST_TOKEN','User')
if (-not $panel -or $panel -notmatch '^https://[A-Za-z0-9-]+\.onrender\.com/?$' -or -not $token) {
    throw 'Windows kullanici ortam degiskenlerine Render adresini ve aktarim anahtarini ekleyin.'
}
$file = Get-Item -LiteralPath $ExcelPath
if ($file.PSIsContainer -or $file.Extension -ne '.xlsx') { throw 'XLSX dosyasi gerekli.' }
$a = $StartDate.ToString('yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
$b = $EndDate.ToString('yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
$uri = $panel.TrimEnd('/') + "/api/import?start=$a&end=$b"
Invoke-RestMethod -Uri $uri -Method Post -Headers @{Authorization = "Bearer $token"} -ContentType 'application/octet-stream' -InFile $file.FullName -TimeoutSec 120
