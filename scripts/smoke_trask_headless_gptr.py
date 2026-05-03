#!/usr/bin/env python3
"""
Smoke test for `vendor/ai-researchwizard/trask_headless_research.py`.

Matches the stdin/stdout contract used by `@openkotor/trask` (`runHeadlessGptResearcher`).

Modes:
  --dry-run   Verify interpreter, repo paths, dotenv + GPTResearcher import (no network/API).
  (default)   Pipe a minimal JSON payload and require valid JSON stdout with a non-empty report.

Examples (repo root):
  python scripts/smoke_trask_headless_gptr.py --dry-run
  python scripts/smoke_trask_headless_gptr.py --timeout-ms 180000

Environment:
  TRASK_GPT_RESEARCHER_PYTHON  Optional Python exe (default: .venv-trask-gptr, then python3/python).

Live mode needs API + retriever configuration loaded by the headless script (typically
`vendor/ai-researchwizard/.env`). See docs/trask.md.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _gptr_root(repo: Path) -> Path:
    return repo / "vendor" / "ai-researchwizard"


def _headless_script(gptr: Path) -> Path:
    return gptr / "trask_headless_research.py"


def _resolve_python(explicit: str | None, repo: Path) -> Path:
    if explicit:
        path = Path(explicit).expanduser()
        if path.is_file():
            return path.resolve()
        raise SystemExit(f"--python not found: {explicit}")

    env_py = os.environ.get("TRASK_GPT_RESEARCHER_PYTHON", "").strip()
    if env_py:
        path = Path(env_py).expanduser()
        if path.is_file():
            return path.resolve()
        raise SystemExit(f"TRASK_GPT_RESEARCHER_PYTHON is set but not found: {env_py}")

    candidates: list[Path] = []
    if sys.platform == "win32":
        candidates.append(repo / ".venv-trask-gptr" / "Scripts" / "python.exe")
    else:
        candidates.append(repo / ".venv-trask-gptr" / "bin" / "python")

    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()

    for cmd in ("python3", "python"):
        found = subprocess.run(
            [cmd, "-c", "import sys; print(sys.executable)"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if found.returncode == 0 and found.stdout.strip():
            return Path(found.stdout.strip()).resolve()

    raise SystemExit(
        "Could not find Python. Create .venv-trask-gptr (scripts/bootstrap_trask_gpt_researcher.*) "
        "or set TRASK_GPT_RESEARCHER_PYTHON.",
    )


def _minimal_payload() -> dict[str, object]:
    """Same structural shape as `HeadlessGptResearcherRequestPayload` / Trask `fetchResearchReport`."""
    return {
        "query": "In one sentence, what is Star Wars: Knights of the Old Republic?",
        "custom_prompt": (
            "Answer in under 80 words. Be factual. "
            'End with the exact heading "Sources" on its own line; '
            "under it, at most one numbered citation line if you cite a URL."
        ),
        "source_urls": [],
        "query_domains": [],
        "report_type": "research_report",
        "report_source": "web",
    }


def _run_dry_run(py: Path, gptr: Path) -> None:
    code = (
        "from dotenv import load_dotenv\n"
        "load_dotenv()\n"
        "from gpt_researcher import GPTResearcher\n"
        'print("smoke_trask_headless_gptr: imports_ok")'
    )
    result = subprocess.run(
        [str(py), "-c", code],
        cwd=str(gptr),
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip()
        hint = (
            "Dry-run failed: this interpreter cannot import GPT Researcher deps.\n"
            "Fix: run scripts/bootstrap_trask_gpt_researcher.ps1 (Windows) or "
            "scripts/bootstrap_trask_gpt_researcher.sh (Unix), or:\n"
            "  pip install -r vendor/ai-researchwizard/requirements.txt\n"
            f"Using Python: {py}\n"
        )
        sys.stderr.write(hint)
        if "ModuleNotFoundError" in err or "ImportError" in err:
            for line in reversed(err.splitlines()):
                if line.strip():
                    sys.stderr.write(f"Cause: {line.strip()}\n")
                    break
        else:
            sys.stderr.write(err + ("\n" if err else ""))
        raise SystemExit(2)
    sys.stdout.write((result.stdout or "").strip() + "\n")


def _run_live(py: Path, gptr: Path, script: Path, timeout_ms: int, payload: dict[str, object]) -> None:
    result = subprocess.run(
        [str(py), str(script)],
        cwd=str(gptr),
        input=json.dumps(payload, ensure_ascii=False),
        capture_output=True,
        text=True,
        timeout=max(1, timeout_ms) / 1000.0,
        encoding="utf-8",
    )

    err = (result.stderr or "").strip()
    out = (result.stdout or "").strip()

    if result.returncode != 0:
        sys.stderr.write(err + ("\n" if err else ""))
        sys.stderr.write(
            "Headless runner exited non-zero. For demos, ensure vendor/ai-researchwizard/.env has "
            "LLM and retriever keys (e.g. OPENAI_API_KEY and default Tavily retriever key).\n",
        )
        raise SystemExit(1)

    try:
        parsed = json.loads(out)
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"stdout was not valid JSON: {exc}\nFirst 500 chars:\n{out[:500]}\n")
        raise SystemExit(1) from exc

    report = parsed.get("report")
    if not isinstance(report, str) or not report.strip():
        sys.stderr.write("JSON missing non-empty string field 'report'.\n")
        raise SystemExit(1)

    info = parsed.get("research_information")
    if info is not None and not isinstance(info, dict):
        sys.stderr.write("'research_information' must be an object or omitted.\n")
        raise SystemExit(1)

    sys.stdout.write("smoke_trask_headless_gptr: live_ok\n")
    sys.stdout.write(f"report_chars={len(report)}\n")
    if isinstance(info, dict):
        su = info.get("source_urls")
        vu = info.get("visited_urls")
        if isinstance(su, list):
            sys.stdout.write(f"research_information.source_urls_count={len(su)}\n")
        if isinstance(vu, list):
            sys.stdout.write(f"research_information.visited_urls_count={len(vu)}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke test trask_headless_research.py")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only verify imports (no research API calls).",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=180_000,
        help="Subprocess timeout for live mode (default 180000).",
    )
    parser.add_argument("--python", type=str, default=None, help="Python executable override.")
    args = parser.parse_args()

    repo = _repo_root()
    gptr = _gptr_root(repo)
    script = _headless_script(gptr)

    if not gptr.is_dir():
        raise SystemExit(f"Missing GPT Researcher tree: {gptr}")
    if not script.is_file():
        raise SystemExit(f"Missing headless script: {script}")

    py = _resolve_python(args.python, repo)

    if args.dry_run:
        _run_dry_run(py, gptr)
        return

    _run_live(py, gptr, script, args.timeout_ms, _minimal_payload())


if __name__ == "__main__":
    main()
