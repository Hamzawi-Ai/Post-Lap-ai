import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("postlap_token");
    localStorage.removeItem("postlap_user");
    localStorage.setItem("postlap_cookie_consent", "1");
  });
  await page.reload();
});

test("header sign-in button opens the login modal", async ({ page }) => {
  const headerBtn = page.getByTestId("button-header-signin");
  await expect(headerBtn).toBeVisible();
  await headerBtn.click();
  await expect(page.getByTestId("modal-login")).toBeVisible();
});

test("chat-first home renders the assistant and the header sign-in opens the login modal", async ({ page }) => {
  // The home page is now a ChatGPT-style chat — verify the assistant is visible
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await page.getByTestId("button-header-signin").click();
  await expect(page.getByTestId("modal-login")).toBeVisible();
});

test("X button closes the login modal", async ({ page }) => {
  await page.getByTestId("button-header-signin").click();
  const modal = page.getByTestId("modal-login");
  await expect(modal).toBeVisible();
  await page.getByTestId("button-login-modal-close").click();
  await expect(modal).not.toBeVisible();
});

test("clicking the backdrop closes the login modal", async ({ page }) => {
  await page.getByTestId("button-header-signin").click();
  const modal = page.getByTestId("modal-login");
  await expect(modal).toBeVisible();
  await modal.click({ position: { x: 10, y: 10 } });
  await expect(modal).not.toBeVisible();
});
