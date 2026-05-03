import { test, expect } from "@playwright/test";

const onboarding = JSON.stringify({
  completed: true,
  boardStyle: "classic",
  notificationChoice: "skip",
  completedAt: new Date().toISOString(),
});

const chitinProof = JSON.stringify({
  filename: "chitin.key",
  size: 1,
  uploadedAt: new Date().toISOString(),
});

function seedStandaloneMatchHub(page: import("@playwright/test").Page): Promise<void> {
  return page.addInitScript(
    ([onb, chi]: [string, string]) => {
      localStorage.setItem("pazaak-world-onboarding-v1", onb);
      localStorage.setItem("cardworld-chitin-proof-v1", chi);
      localStorage.removeItem("pazaak-world-standalone-auth-token-v1");
    },
    [onboarding, chitinProof],
  );
}

test.describe("Nakama quick match (two browsers)", () => {
  test.beforeAll(async ({ request }) => {
    const port = process.env.VITE_NAKAMA_PORT ?? "7350";
    const host = process.env.VITE_NAKAMA_HOST ?? "127.0.0.1";
    const res = await request.get(`http://${host}:${port}/healthcheck`).catch(() => null);
    if (!res?.ok()) {
      test.skip(true, `Nakama not reachable at http://${host}:${port}/healthcheck — run pnpm dev:pazaak-nakama (or docker compose) and rebuild the runtime (pnpm build:pazaak-nakama).`);
    }
  });

  test("two guests queue and both reach the live table", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await seedStandaloneMatchHub(pageA);
    await seedStandaloneMatchHub(pageB);

    await pageA.goto("/bots/pazaakworld");
    await pageB.goto("/bots/pazaakworld");

    await expect(pageA.getByRole("button", { name: "Find Match" })).toBeVisible({ timeout: 60_000 });
    await expect(pageB.getByRole("button", { name: "Find Match" })).toBeVisible({ timeout: 60_000 });

    await pageA.getByRole("button", { name: "Find Match" }).click();
    await pageB.getByRole("button", { name: "Find Match" }).click();

    await expect(pageA.locator('[data-testid="draw-btn"]')).toBeVisible({ timeout: 90_000 });
    await expect(pageB.locator('[data-testid="draw-btn"]')).toBeVisible({ timeout: 90_000 });

    const enabledA = await pageA.locator('[data-testid="draw-btn"]').isEnabled();
    const enabledB = await pageB.locator('[data-testid="draw-btn"]').isEnabled();
    expect(enabledA || enabledB).toBe(true);

    await contextA.close();
    await contextB.close();
  });
});
