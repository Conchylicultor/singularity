// Drives the light/dark toolbar toggle against the deployed app and prints what
// the page actually did: the `<html>.dark` class and the button's own label,
// before and after one click.
//
// It exists because the toggle's read and its write are two different config
// calls, and when they name different scopes the button still renders, still
// looks clickable, and changes nothing on screen — a failure no static check
// sees. Reading the class is what makes that visible.
//
// Usage:
//   bun plugins/ui/plugins/theme-toggle/e2e/theme-toggle-verify.ts [--base http://<worktree>.localhost:9000]

import {
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const BASE = baseUrl();
const OUT = "/tmp/theme-toggle";

await withBrowser(async (h) => {
  const { page, captured } = await h.session();

  const toggle = () =>
    page.getByRole("button", { name: /Switch to (light|dark) mode/ }).first();
  const isDark = () =>
    page.evaluate(() => document.documentElement.classList.contains("dark"));
  const label = () => toggle().getAttribute("aria-label");

  // On a cold cache the pre-paint script paints the OS's scheme as a floor and
  // the class applier corrects it once React mounts and config hydrates — around
  // 3s in, which a fixed wait straddles. So wait for the two to AGREE rather than
  // for a duration; if they never do, the poll gives up and the assertions below
  // report the disagreement as the failure it is.
  async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      const [dark, name] = [await isDark(), await label()];
      if (name === (dark ? "Switch to light mode" : "Switch to dark mode"))
        return;
      await page.waitForTimeout(500);
    }
  }

  await page.goto(`${BASE}/agents`);
  await toggle().waitFor({ timeout: 30_000 });
  await settle();

  const darkBefore = await isDark();
  const labelBefore = await label();
  console.log(
    `before: html.dark=${darkBefore} label=${JSON.stringify(labelBefore)}`,
  );
  await snap(page, OUT, "before");

  // Unpinned, the action bar is a hover-revealed floating panel in the top-right
  // corner: its collapsed hitbox covers the buttons until the pointer is over it,
  // so hovering the button itself never lands. Move to the corner first, let the
  // panel open, then click.
  const box = page.viewportSize() ?? { width: 1400, height: 900 };
  await page.mouse.move(box.width - 24, 20);
  await page.waitForTimeout(600);
  await toggle().click();
  await page.waitForTimeout(1200);
  await settle();

  const darkAfter = await isDark();
  const labelAfter = await label();
  console.log(
    `after:  html.dark=${darkAfter} label=${JSON.stringify(labelAfter)}`,
  );
  await snap(page, OUT, "after");

  // The label describes the scheme on screen, so both must move together: a label
  // that flips while the class does not is exactly the bug this script is for.
  const r = report("theme-toggle");
  r.ok(
    "one click flips the page",
    darkAfter !== darkBefore,
    `html.dark stayed ${darkBefore}`,
  );
  r.eq(
    "label before describes the page",
    labelBefore,
    darkBefore ? "Switch to light mode" : "Switch to dark mode",
  );
  r.eq(
    "label after describes the page",
    labelAfter,
    darkAfter ? "Switch to light mode" : "Switch to dark mode",
  );
  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
  r.finish();
});
