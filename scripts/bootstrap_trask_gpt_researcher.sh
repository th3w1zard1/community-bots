#!/usr/bin/env bash
# Bootstrap a Python venv with GPT Researcher deps for Trask headless research.
# Usage (from repo root):
#   bash scripts/bootstrap_trask_gpt_researcher.sh
# Then set TRASK_GPT_RESEARCHER_PYTHON to .venv-trask-gptr/bin/python

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="${REPO_ROOT}/.venv-trask-gptr"
REQ_FILE="${REPO_ROOT}/vendor/ai-researchwizard/requirements.txt"

if [[ ! -f "${REQ_FILE}" ]]; then
  echo "Missing ${REQ_FILE}" >&2
  exit 1
fi

python3 -m venv "${VENV_DIR}"
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "${REQ_FILE}"

echo ""
echo "Done. Point Trask at:"
echo "  export TRASK_GPT_RESEARCHER_PYTHON=${VENV_DIR}/bin/python"
