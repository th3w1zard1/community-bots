import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ResearchWizardRuntimeConfig } from "@openkotor/config";

export interface HeadlessGptResearcherResult {
  readonly report: string;
  readonly research_information?: {
    readonly source_urls?: readonly string[] | null;
    readonly visited_urls?: readonly string[] | null;
  };
}

/** stdin payload for `vendor/ai-researchwizard/trask_headless_research.py`. */
export interface HeadlessGptResearcherRequestPayload {
  readonly query: string;
  readonly custom_prompt?: string;
  readonly source_urls?: readonly string[];
  readonly query_domains?: readonly string[];
  readonly report_type?: string;
  readonly report_source?: string;
}

const spawnHeadless = (
  python: string,
  script: string,
  cwd: string,
  payload: HeadlessGptResearcherRequestPayload,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> => {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(python, [script], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    const chunksOut: Buffer[] = [];
    const chunksErr: Buffer[] = [];
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer | string) => {
      chunksOut.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      chunksErr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGTERM");
      rejectPromise(new Error(`GPT Researcher headless runner timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      rejectPromise(error);
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolvePromise({
        stdout: Buffer.concat(chunksOut).toString("utf8").trim(),
        stderr: Buffer.concat(chunksErr).toString("utf8").trim(),
        code: exitCode,
      });
    });

    try {
      child.stdin?.write(Buffer.from(JSON.stringify(payload), "utf8"));
      child.stdin?.end();
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectPromise(error);
      }
    }
  });
};

export const runHeadlessGptResearcher = async (
  config: ResearchWizardRuntimeConfig,
  payload: HeadlessGptResearcherRequestPayload,
): Promise<HeadlessGptResearcherResult> => {
  const root = config.gptResearcherRoot?.trim();

  if (!root) {
    throw new Error(
      "GPT Researcher root could not be resolved. Clone or vendor ai-researchwizard under <repo>/vendor/ai-researchwizard (with gpt_researcher/), or set TRASK_GPT_RESEARCHER_ROOT.",
    );
  }

  const script = (config.headlessScriptPath?.trim() || join(root, "trask_headless_research.py")).trim();

  if (!existsSync(script)) {
    throw new Error(`GPT Researcher headless script not found: ${script}`);
  }

  const python = config.pythonExecutable?.trim() || "python";

  const { stdout, stderr, code } = await spawnHeadless(python, script, root, payload, config.timeoutMs);

  if (code !== 0) {
    throw new Error(`GPT Researcher headless runner exited ${code ?? "unknown"}: ${stderr || stdout || "no output"}`);
  }

  try {
    const parsed = JSON.parse(stdout) as HeadlessGptResearcherResult;

    if (typeof parsed.report !== "string" || !parsed.report.trim()) {
      throw new Error("Headless runner returned empty report.");
    }

    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`GPT Researcher headless runner returned invalid JSON: ${stdout.slice(0, 400)}`);
    }

    throw error;
  }
};
