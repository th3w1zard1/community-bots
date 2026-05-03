# Bootstrap a Python venv with GPT Researcher deps for Trask headless research.
# Usage (from repo root):
#   .\scripts\bootstrap_trask_gpt_researcher.ps1
# Then set TRASK_GPT_RESEARCHER_PYTHON to .venv-trask-gptr\Scripts\python.exe

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$VenvDir = Join-Path $RepoRoot ".venv-trask-gptr"
$ReqFile = Join-Path $RepoRoot "vendor\ai-researchwizard\requirements.txt"

if (-not (Test-Path $ReqFile)) {
    Write-Error "Missing $ReqFile — run from monorepo with vendor/ai-researchwizard present."
}

Write-Host "Creating venv: $VenvDir"
python -m venv $VenvDir

$Py = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $Py)) {
    Write-Error "venv python not found at $Py"
}

& $Py -m pip install --upgrade pip
& $Py -m pip install -r $ReqFile

Write-Host ""
Write-Host "Done. Point Trask at this interpreter:"
Write-Host "  TRASK_GPT_RESEARCHER_PYTHON=$Py"
