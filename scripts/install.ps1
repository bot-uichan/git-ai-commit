param(
  [string]$Version = "latest",
  [string]$InstallDir = "$HOME\bin"
)

$ErrorActionPreference = "Stop"
$repo = "bot-uichan/git-ai-commit"
$asset = "git-ai-commit-windows-x64.exe"

if ($Version -eq "latest") {
  $assetUrl = "https://github.com/$repo/releases/latest/download/$asset"
  $checksumUrl = "https://github.com/$repo/releases/latest/download/$asset.sha256"
} else {
  $assetUrl = "https://github.com/$repo/releases/download/$Version/$asset"
  $checksumUrl = "https://github.com/$repo/releases/download/$Version/$asset.sha256"
}

$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP "git-ai-commit-install-$([guid]::NewGuid())")
$exePath = Join-Path $tmp.FullName "git-ai-commit.exe"
$shaPath = Join-Path $tmp.FullName "git-ai-commit.sha256"

Write-Host "Downloading $asset..."
Invoke-WebRequest -Uri $assetUrl -OutFile $exePath
Invoke-WebRequest -Uri $checksumUrl -OutFile $shaPath

$expected = (Get-Content $shaPath).Split(" ")[0].ToLowerInvariant()
$actual = (Get-FileHash $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expected -ne $actual) {
  throw "Checksum mismatch: expected $expected actual $actual"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$dest = Join-Path $InstallDir "git-ai-commit.exe"
Copy-Item -Force $exePath $dest

Write-Host "Installed to $dest"
Write-Host "If needed, add to PATH: $InstallDir"
