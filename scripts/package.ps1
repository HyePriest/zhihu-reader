$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$destination = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$archive = Join-Path $destination "zhihu-reader-v$($manifest.version).zip"
# Explicit list: dependencies, tests, local configuration and old archives stay out.
$files = @('manifest.json', 'background.js', 'extract.js', 'shared.js', 'reader.js', 'reader.html', 'reader.css', '使用说明.md', 'PRIVACY.md', 'LICENSE')
$sources = foreach ($file in $files) {
  $source = Join-Path $projectRoot $file
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing release file: $file" }
  $source
}
Compress-Archive -LiteralPath $sources -DestinationPath $archive -Force
Write-Output "Created $archive"
