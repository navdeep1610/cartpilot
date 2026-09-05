import { expect, test } from "@playwright/test";

test("a vague request pauses, accepts context, and exposes bounded agent evidence", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "An AI sales agent for better routines and stronger carts." })).toBeVisible();

  await page.getByLabel("Your skin and shopping goal").fill("Help me choose skincare");
  await page.getByRole("button", { name: "Build my routine" }).click();

  await expect(page.getByRole("heading", { name: "One detail will help" })).toBeVisible();
  await expect(page.getByText("Waiting for the shopper's answer; no order or offer was created.")).toBeVisible();
  await page.getByRole("button", { name: "Oily skin with clogged pores" }).click();

  await expect(page.getByRole("button", { name: "Add the routine to cart" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What CartPilot did" })).toBeVisible();
  await expect(page.getByText("Deterministic merchant rule").first()).toBeVisible();
  await expect(page.getByText("Shopper follow-up:")).toHaveCount(0);
  await expect(page.getByLabel("Conversation with CartPilot")).toContainText("Oily skin with clogged pores");
});

test("the medical boundary stops a commercial recommendation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your skin and shopping goal").fill("I have sensitive skin with an open wound and need a prescription");
  await page.getByRole("button", { name: "Build my routine" }).click();

  await expect(page.getByRole("heading", { name: "A professional should help with this concern" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("No routine, order or commercial action was created.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add the routine to cart" })).toHaveCount(0);
});

test("the merchant area remains access-controlled", async ({ page }) => {
  await page.goto("/merchant");
  await expect(page).toHaveURL(/\/merchant\/login\?next=%2Fmerchant$/);
  await expect(page.getByRole("heading", { name: "Your customer data stays private." })).toBeVisible();
});
