#Requires -Version 5.1
<#
.SYNOPSIS
  Build and push the AI Video Studio (小说工作室) unified image to Docker Hub.

.PARAMETER User
  Docker Hub username. Falls back to DOCKERHUB_USER in .env.

.PARAMETER Tag
  Image tag. Defaults to latest.

.EXAMPLE
  .\scripts\docker-publish.ps1 -User myname
  .\scripts\docker-publish.ps1 -User myname -Tag 1.0.0
#>
param(
  [string]$User = '',
  [string]$Tag = 'latest'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Read-DockerHubUserFromEnv {
  $envFile = Join-Path $Root '.env'
  if (-not (Test-Path $envFile)) { return '' }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*DOCKERHUB_USER\s*=\s*(.+)\s*$') {
      $value = $Matches[1].Trim()
      $value = $value.Trim('"')
      $value = $value.Trim("'")
      return $value
    }
  }
  return ''
}

if (-not $User) {
  $User = Read-DockerHubUserFromEnv
}

if (-not $User) {
  Write-Host 'Set your Docker Hub username:' -ForegroundColor Red
  Write-Host '  .\scripts\docker-publish.ps1 -User <username>' -ForegroundColor Yellow
  Write-Host 'Or set DOCKERHUB_USER in .env' -ForegroundColor Yellow
  exit 1
}

$image = "${User}/ai-video-studio:${Tag}"

Write-Host 'Login to Docker Hub...' -ForegroundColor Cyan
Write-Host "  account: $User"
docker login
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Build image...' -ForegroundColor Cyan
Write-Host "  tag: $image"
docker build -t $image .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Push image...' -ForegroundColor Cyan
docker push $image
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host "  image: $image"
Write-Host ''
Write-Host 'Deploy from Docker Hub:' -ForegroundColor Cyan
Write-Host '  1. cp .env.example .env'
Write-Host "  2. set DOCKERHUB_USER=$User in .env"
Write-Host '  3. docker compose -f docker-compose.hub.yml pull'
Write-Host '  4. docker compose -f docker-compose.hub.yml up -d'
