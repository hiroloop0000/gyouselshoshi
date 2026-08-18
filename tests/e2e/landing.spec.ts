import { expect, test } from "@playwright/test";

test("landing page communicates the learning system and is keyboard reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /間違いを/ })).toBeVisible();
  await expect(page.getByText("誤答を得点力へ変える、6つの工程。")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "本文へ移動" })).toBeFocused();
});

test("open registration call to action does not require an invitation code", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^学習を始める/ }).first().click();
  await expect(page).toHaveURL(/login/);
  await expect(page.getByRole("heading", { name: "学習を始めましょう" })).toBeVisible();
  await expect(page.getByText("招待コードなしで、すぐに登録できます。")).toBeVisible();
  await expect(page.getByLabel("招待コード")).toHaveCount(0);
});

test("shares the current URL by clipboard and QR code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "リンクをコピー" }).click();
  await expect(page.getByRole("status")).toHaveText("リンクをコピーしました。");
  await page.getByRole("button", { name: "QRコードを表示" }).click();
  await expect(page.getByRole("img", { name: "行書PASS共有用QRコード" })).toBeVisible();
  await expect(page.getByText("http://127.0.0.1:4173/")).toBeVisible();
});
