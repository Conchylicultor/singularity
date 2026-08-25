// Manual capture of the config DETAIL pane — the surface where every config
// field renderer lands at once, and so the one place a change to the field
// contract is visible in aggregate rather than one type at a time.
//
// Nothing runs this automatically. It exists because the detail pane is reached
// by CLICKING a tree row: the route param is a URL-encoded `storePath`, which a
// static `playwright screenshot <url>` cannot practically hand-write, and which
// silently renders "Config not found" when guessed wrong.
//
//   bun plugins/config_v2/plugins/settings/e2e/config-detail-shot.ts \
//     --config notation --out /tmp/cfg
//
// `--config` matches the tree row's own text, not the storePath.
import {
  arg,
  pathUrl,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const config = arg("config", "notation");
const out = arg("out", "/tmp/config-detail");
const scheme = arg("color-scheme", "dark") as "dark" | "light";

await withBrowser(async (h) => {
  const { page } = await h.session({
    viewport: { width: 1400, height: 950 },
    colorScheme: scheme,
  });

  await page.goto(pathUrl("/settings/config"));
  // The nav is a DataView tree over the plugin graph; it paints after the
  // registration list hydrates, so a fixed wait here is a floor, not a guess.
  await page.waitForTimeout(6000);

  const row = page.locator(`text="${config}"`).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page.waitForTimeout(3500);

  console.log(`url after click: ${page.url()}`);
  const notFound = await page.getByText("Config not found").count();
  console.log(
    `config found:    ${notFound === 0 ? "yes" : "NO — row matched but pane did not resolve"}`,
  );

  await page.screenshot({ path: `${out}.png` });
  console.log(`wrote ${out}.png`);
});
