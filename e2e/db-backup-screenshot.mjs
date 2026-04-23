import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto("http://claude-1776985884-2yrk.localhost:9000");
await page.waitForTimeout(2000);

await page.click("text=Debug");
await page.waitForTimeout(500);
await page.click("text=DB Backup");
await page.waitForTimeout(2000);

await page.screenshot({ path: "/tmp/db-backup-ui.png" });
await browser.close();
