import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = (process.env.ELLIE_SCREENSHOT_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const imageDir = resolve("docs/images");

function resetSeed(): void {
  execSync("npm run seed:reset", {
    stdio: "inherit",
    env: { ...process.env, SEED_ANCHOR_DATE: "2026-10-16" },
  });
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/executable|browser.*install|playwright install/i.test(message)) {
    console.log("Playwright Chromium is not installed. Run: npx playwright install chromium");
    process.exit(0);
  }
  throw error;
}

resetSeed();
mkdirSync(imageDir, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const health = await page.request.get(`${baseUrl}/sim/`).catch(() => undefined);
  if (!health?.ok()) throw new Error(`Simulator is not available at ${baseUrl}/sim/. Start the server and retry.`);
  await page.goto(`${baseUrl}/sim/`);
  await page.getByRole("textbox", { name: "Say something to Ellie" }).waitFor();
  await page.screenshot({ path: resolve(imageDir, "simulator-idle.png") });

  await page.getByRole("button", { name: "The cylinder's changed and the purifier is beeping again" }).click();
  await page.locator(".card-stack .ellie-card").nth(1).waitFor();
  await page.screenshot({ path: resolve(imageDir, "simulator-hero.png") });

  await page.locator(".card-stack .ellie-card").nth(1).getByRole("button", { name: "Steps on phone" }).click();
  const fixLinkButton = page.getByRole("button", { name: "Open Ellie link" }).last();
  await fixLinkButton.waitFor({ timeout: 15_000 });
  await fixLinkButton.click();
  const fixHref = await page.locator('iframe[title="Phone browser"]').getAttribute("src");
  if (!fixHref) throw new Error("The fix message did not open a phone link.");
  const fixPage = await context.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await fixPage.goto(new URL(fixHref, baseUrl).href);
  await fixPage.locator(".phone-app").waitFor({ timeout: 15_000 });
  await fixPage.screenshot({ path: resolve(imageDir, "phone-fix.png") });
  await fixPage.close();

  await page.getByRole("button", { name: /Day 30.*reminder/i }).click();
  await page.getByText(/reminder(?:s)? sent/i).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(2_100);
  const bookingLinkButton = page.getByRole("button", { name: "Open Ellie link" }).last();
  await bookingLinkButton.waitFor({ timeout: 15_000 });
  await bookingLinkButton.click();
  const bookingHref = await page.locator('iframe[title="Phone browser"]').getAttribute("src");
  if (!bookingHref) throw new Error("The reminder did not open a phone booking link.");
  const bookingPage = await context.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await bookingPage.goto(new URL(bookingHref, baseUrl).href);
  await bookingPage.locator(".phone-app").waitFor({ timeout: 15_000 });
  await bookingPage.getByRole("heading").first().waitFor();
  await bookingPage.screenshot({ path: resolve(imageDir, "phone-booking.png") });
  await bookingPage.close();
  await context.close();
  console.log(`Screenshots saved to ${imageDir}`);
} finally {
  await browser.close();
  resetSeed();
}
