import { expect, test } from "@playwright/test";

test.describe("HK-86 bots hub (static)", () => {
  test("HK panel loads with docs and panels JSON links", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "HK-86" })).toBeVisible();
    const hkSection = page.locator("section").filter({ has: page.locator("#hk-title") });
    await expect(hkSection.getByRole("link", { name: "Documentation" })).toHaveAttribute(
      "href",
      /community-bots\/wiki\/docs\/guides\/hk-86/,
    );
    await expect(hkSection.getByRole("link", { name: "Reaction panels example JSON" })).toHaveAttribute(
      "href",
      /reaction-role-panels\.example\.json/,
    );
    await hkSection.locator("details.hk-details summary").click();
    await expect(hkSection.getByText(/watches the file/i)).toBeVisible();
  });

  test("HK invite uses reaction-panel permission integer when app id is set", async ({ page }) => {
    await page.goto("/");

    const invite = page.locator("#hk-invite");

    if ((await invite.getAttribute("class"))?.includes("hidden")) {
      test.skip(true, "Build without VITE_HK_DISCORD_APPLICATION_ID — invite anchor hidden.");
      return;
    }

    const href = await invite.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain("discord.com");
    expect(href).toContain("permissions=2416266304");
  });
});
