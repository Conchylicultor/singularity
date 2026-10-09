// Screenshots one exhibit's entry in Debug → Exhibits — its label row and one
// frame per declared width — cropped to the entry, so a component can be
// looked at populated without data in the worktree DB.
//
// Usage:
//   ./singularity run plugins/plugin-meta/plugins/exhibits/e2e/exhibit-shot.ts \
//     --id <group/name> [--id <group/name> …] [--out /tmp/exhibit] \
//     [--color-scheme light|dark]
//
// Writes `<out>-<group>_<name>-<scheme>.png` per id.

import {
  arg,
  pathUrl,
  usage,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const ids = process.argv.flatMap((a, i, all) =>
  a === "--id" && all[i + 1] !== undefined ? [all[i + 1] as string] : [],
);
if (ids.length === 0) {
  usage(
    "exhibit-shot.ts --id <group/name> [--id …] [--out <prefix>] [--color-scheme light|dark]",
  );
}
const out = arg("out", "/tmp/exhibit");
const colorScheme = arg("color-scheme", "light") === "dark" ? "dark" : "light";

await withBrowser(async (h) => {
  // Wide and tall enough that the widest frame of an entry fits unscrolled.
  const { page } = await h.session({
    viewport: { width: 1800, height: 1400 },
    colorScheme,
  });
  await page.goto(pathUrl("/debug/exhibits"));
  for (const id of ids) {
    // The gallery prints each exhibit's id as a caption in its label row; the
    // entry is that row's parent stack (label row, then the width frames).
    const caption = page.getByText(id, { exact: true });
    await caption.waitFor({ state: "visible", timeout: 45_000 });
    const entry = caption.locator("xpath=../..");
    await entry.scrollIntoViewIfNeeded();
    // App exhibits load their component lazily; let the frames settle.
    await page.waitForTimeout(4000);
    const path = `${out}-${id.replace(/\//g, "_")}-${colorScheme}.png`;
    await entry.screenshot({ path });
    console.log(`wrote ${path}`);
  }
});
