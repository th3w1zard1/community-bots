#!/usr/bin/env python3
"""
Print FAST_LLM / SMART_LLM friendly values using vendored llm_fallbacks chat ordering.

Usage (repo root, after installing llm_fallbacks deps — see vendor/llm_fallbacks/README.md):

  python scripts/trask_print_fallback_llm.py

Optional: set OPENROUTER_API_KEY so OpenRouter model enrichment runs (see llm_fallbacks AGENTS.md).

These lines can be appended to ai-researchwizard backend env or shell-exported before uvicorn.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "vendor" / "llm_fallbacks" / "src"
sys.path.insert(0, str(SRC))

from llm_fallbacks import get_fallback_list


def main() -> None:
    models = list(get_fallback_list("chat"))
    pick = models[0] if models else "openrouter/auto"
    print(f"FAST_LLM={pick}")
    print(f"SMART_LLM={pick}")
    if not models:
        print("# warning: no models from llm_fallbacks; defaulting to openrouter/auto", file=sys.stderr)


if __name__ == "__main__":
    main()
