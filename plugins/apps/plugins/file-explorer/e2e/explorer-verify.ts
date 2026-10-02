// The file explorer, end to end on a deployed build.
//
// A throwaway folder is made on the host (the deploy reads the same disk):
//   fx-e2e-<random>/
//     notes.md      → a rendered Markdown preview
//     blob.xyz      → binary, no preview: the fallback
//     sub/inner.txt → a folder to expand lazily and to re-root into
//
//  1. /files opens on the home folder.
//  2. ⌘L, type the folder's path minus its last letters, Tab completes it,
//     Enter lists it (and the URL names it).
//  3. Expand `sub` with its chevron: `inner.txt` appears under it.
//  4. Click `notes.md`: the preview renders its heading.
//  5. Click `blob.xyz`: the preview says it has no preview.
//  6. Double-click `sub`: it becomes the listing; Back returns.
//
// Usage:
//   ./singularity run plugins/apps/plugins/file-explorer/e2e/explorer-verify.ts \
//     [--out /tmp/explorer] [--headed]

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import {
  arg,
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const out = arg("out") ?? join(tmpdir(), "explorer-verify");

const fixture = mkdtempSync(join(tmpdir(), "fx-e2e-"));
writeFileSync(
  join(fixture, "notes.md"),
  "# Explorer fixture\n\nA **rendered** paragraph.\n",
);
writeFileSync(join(fixture, "blob.xyz"), Buffer.from([0, 1, 2, 0, 255, 0]));
mkdirSync(join(fixture, "sub"));
writeFileSync(join(fixture, "sub", "inner.txt"), "inner\n");

/** A tree row by its label. */
function row(page: Page, name: string) {
  return page.locator("[data-tree-row]", { hasText: name }).first();
}

async function waitRow(page: Page, name: string): Promise<boolean> {
  try {
    await row(page, name).waitFor({ state: "visible", timeout: 10_000 });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") return false;
    throw err;
  }
}

const r = report("file explorer");

try {
  await withBrowser(async (h) => {
    const { page } = await h.session({
      viewport: { width: 1440, height: 900 },
    });

    // 1. Home.
    await boot(page, pathUrl("/files"), { marker: "[data-tree-row]" });
    r.ok(
      "home lists rows",
      (await page.locator("[data-tree-row]").count()) > 0,
    );
    await snap(page, out, "1-home");

    // 2. ⌘L → type a prefix → Tab → Enter.
    await page.keyboard.press("ControlOrMeta+l");
    const field = page
      .getByRole("combobox", { name: "Path" })
      .or(page.getByLabel("Path"))
      .first();
    await field.waitFor({ state: "visible", timeout: 5_000 });
    const prefix = fixture.slice(0, -3);
    await field.fill(prefix);
    await page.waitForTimeout(800);
    await field.press("Tab");
    await page.waitForTimeout(300);
    const completed = await field.inputValue();
    r.ok(
      "Tab completes the folder",
      completed
        .replace(/\/$/, "")
        .endsWith(fixture.slice(fixture.lastIndexOf("/"))),
      `field reads ${completed}`,
    );
    await field.press("Enter");
    r.ok("Enter lists the folder", await waitRow(page, "notes.md"));
    r.ok(
      "the URL names the folder",
      decodeURIComponent(page.url()).includes(
        fixture.slice(fixture.lastIndexOf("/")),
      ),
      page.url(),
    );
    r.ok("its subfolder is listed", await waitRow(page, "sub"));
    await snap(page, out, "2-listing");

    // 3. Expand `sub` lazily.
    await row(page, "sub").hover();
    await row(page, "sub").locator("button[aria-label='Expand']").click();
    r.ok("expanding lists the subfolder", await waitRow(page, "inner.txt"));
    await snap(page, out, "3-expanded");

    // 4. Markdown preview.
    await row(page, "notes.md").click();
    const heading = page.locator("h1", { hasText: "Explorer fixture" });
    let rendered = true;
    try {
      await heading.waitFor({ state: "visible", timeout: 10_000 });
    } catch (err) {
      if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
      rendered = false;
    }
    r.ok("a .md file renders as Markdown", rendered);
    await snap(page, out, "4-markdown");

    // 5. Unknown binary → fallback.
    await row(page, "blob.xyz").click();
    const noPreview = page.getByText(/No preview for/);
    let fellBack = true;
    try {
      await noPreview.waitFor({ state: "visible", timeout: 10_000 });
    } catch (err) {
      if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
      fellBack = false;
    }
    r.ok("an unknown binary falls back", fellBack);
    await snap(page, out, "5-fallback");

    // 6. Re-root into `sub`, then Back.
    await row(page, "sub").dblclick();
    await page.waitForTimeout(800);
    r.ok(
      "double-click re-roots",
      decodeURIComponent(page.url()).includes("/sub"),
      page.url(),
    );
    r.ok("the subfolder is the listing", await waitRow(page, "inner.txt"));
    await snap(page, out, "6-rerooted");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    r.ok("Back returns to the folder", await waitRow(page, "notes.md"));
  });
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

await r.finish();
