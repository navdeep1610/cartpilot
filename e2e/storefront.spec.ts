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
  await expect(page).toHaveURL(/\/merchant\/login(?:\?|$)/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/merchant");
  await expect(page.getByRole("heading", { name: "Your customer data stays private." })).toBeVisible();
});

test("a new shopper saves personal details and returns to the same cart", async ({ page }) => {
  await page.route("**/api/v1/customer-profile", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profile: null }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          customerProfileId: "CUSTOMER-11111111-1111-4111-8111-111111111111",
          name: "Demo Shopper",
          email: "shopper@example.com",
          phone: "+91 98765 43210",
          deliveryAddress: "21 Demo Street, New Delhi",
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Add full kit" }).click();
  await expect(page.getByRole("heading", { name: "Shopping cart" })).toBeVisible();
  await expect(page.getByText("Policy checks passed")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel(/I confirm this exact cart and total/).check();
  await page.getByRole("button", { name: /Pay with Razorpay Test Mode/ }).click();

  await expect(page.getByRole("heading", { name: "Add personal details" })).toBeVisible();
  await page.getByLabel("Full name").fill("Demo Shopper");
  await page.getByLabel("Email address").fill("shopper@example.com");
  await page.getByLabel("Phone number").fill("+91 98765 43210");
  await page.getByLabel("Delivery address").fill("21 Demo Street, New Delhi");
  await page.getByRole("button", { name: "Save and return to cart" }).click();

  await expect(page.getByRole("heading", { name: "Shopping cart" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add personal details" })).toHaveCount(0);
  await expect(page.getByText("Acne Control Starter Kit").last()).toBeVisible();
});

test("a customer can open completed orders from the storefront", async ({ page }) => {
  const profile = {
    customerProfileId: "CUSTOMER-11111111-1111-4111-8111-111111111111",
    name: "Demo Shopper",
    email: "shopper@example.com",
    phone: "+91 98765 43210",
    deliveryAddress: "21 Demo Street, New Delhi",
  };
  await page.route("**/api/v1/customer-profile", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ profile }),
  }));
  await page.route("**/api/v1/customer-orders", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      orders: [{
        orderId: "ORD-DEMO-12345678",
        amountPaise: 129900,
        currency: "INR",
        placedAt: "2026-09-05T09:00:00.000Z",
        status: "confirmed",
        statusLabel: "Payment captured · Ready to pack",
        testMode: true,
        lines: [{
          variantId: "BND-001-KIT",
          productId: "BND-001",
          productName: "Acne Control Starter Kit",
          productType: "Bundle",
          size: "3-product kit",
          quantity: 1,
          lineTotalPaise: 129900,
        }],
      }],
      generatedAt: "2026-09-05T09:01:00.000Z",
      storage: "supabase",
      testMode: true,
    }),
  }));

  await page.goto("/");
  await page.getByRole("button", { name: "Open my profile" }).click();
  await expect(page.getByText("Profile stored in Supabase — ready for checkout.")).toBeVisible();
  await page.getByRole("button", { name: "Close profile" }).click();
  await page.getByRole("button", { name: "Open my orders" }).click();

  await expect(page.getByRole("heading", { name: "My orders" })).toBeVisible();
  await expect(page.getByText("ORD-DEMO-12345678")).toBeVisible();
  await expect(page.getByText("Payment captured · Ready to pack")).toBeVisible();
  await expect(page.getByLabel("My orders", { exact: true }).getByText("Acne Control Starter Kit")).toBeVisible();
});
