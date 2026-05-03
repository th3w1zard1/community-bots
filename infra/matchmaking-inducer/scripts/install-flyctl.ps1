#Requires -Version 5.1
<#
.SYNOPSIS
  Install Fly.io CLI via winget (Windows).
#>
$ErrorActionPreference = "Stop"
if (Get-Command flyctl -ErrorAction SilentlyContinue) {
  Write-Host "flyctl already on PATH:" (Get-Command flyctl).Source
  flyctl version
  exit 0
}
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Error "winget not found. Install Fly CLI manually: https://fly.io/docs/hands-on/install-flyctl/"
  exit 1
}
winget install Fly-io.flyctl --accept-package-agreements --accept-source-agreements
Write-Host "Restart the terminal or refresh PATH, then: flyctl version"
