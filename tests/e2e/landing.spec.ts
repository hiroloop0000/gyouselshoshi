import { expect, test } from "@playwright/test";

test("landing page communicates the learning system and is keyboard reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /間違いを/ })).toBeVisible();
  await expect(page.getByText("誤答を得点力へ変える、6つの工程。")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "本文へ移動" })).toBeFocused();
});

test("mobile navigation call to action opens the authentication screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /招待コードで学習を始める/ }).first().click();
  await expect(page).toHaveURL(/login/);
  await expect(page.getByRole("heading", { name: "学習を始めましょう" })).toBeVisible();
});
