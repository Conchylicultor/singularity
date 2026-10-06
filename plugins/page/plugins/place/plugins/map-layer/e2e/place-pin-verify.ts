// Looks at the place pins on a page that has a /map block: for each pin it logs
// the drop's paint (fill, ring, shape) and whether its label sits on the head's
// centre line, then writes a close-up of the map.
//
// A transcript tool, not a gate: it fails only when the page shows no place pin.
// The page must already hold located /place blocks and a /map block, and the
// deploy needs a Google Maps browser key.
//
// Usage:
//   ./singularity run plugins/page/plugins/place/plugins/map-layer/e2e/place-pin-verify.ts \
//     --path /pages/page/<page-id> [--out /tmp/place-pin] [--headed]

import {
  arg,
  requirePage,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const OUT = arg("out") ?? "/tmp/place-pin";

await withBrowser(async (h) => {
  const { page } = await h.session({
    // Dark app over light tiles: the case where label ink must follow the tiles.
    colorScheme: "dark",
    viewport: { width: 1400, height: 1000 },
  });
  await page.goto(
    requirePage(
      "place-pin-verify.ts --path /pages/page/<page-id> [--out /tmp/place-pin]",
    ),
  );

  const map = page.getByTestId("map");
  await map.scrollIntoViewIfNeeded({ timeout: 60_000 });
  // The drop's head is the only element in a pin with a square bottom-left corner.
  const heads = map.locator(".rounded-bl-none");
  // Throws when no pin appears: a page with a map but no pin is the one failure.
  await heads.first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(1500); // tiles

  const pins = await heads.evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      const head = el.getBoundingClientRect();
      const pinRoot = el.closest(".group\\/pin");
      const label = pinRoot?.querySelector("[style*='translate']");
      const lr = label?.getBoundingClientRect();
      return {
        label: label?.textContent ?? null,
        // The map label's text element: it carries the outline, and it is the
        // truncating box whose clip would cut that outline off.
        ...(() => {
          const text = label?.querySelector<HTMLElement>(
            "[style*='text-shadow']",
          );
          if (!text) return { ink: null, haloRoom: null, truncated: null };
          const ts = getComputedStyle(text);
          return {
            ink: ts.color,
            haloRoom: `${ts.overflow} pad ${ts.paddingRight}`,
            // An ellipsis on a name well under the label's max width is a bug.
            truncated: text.scrollWidth > text.clientWidth,
          };
        })(),
        fill: cs.backgroundColor,
        ring: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        radius: cs.borderRadius,
        rotate: cs.rotate,
        // Rotated 45°, the head's box is wider than the disc; its centre is still the disc's.
        headCentreY: Math.round(head.top + head.height / 2),
        labelCentreY: lr ? Math.round(lr.top + lr.height / 2) : null,
      };
    }),
  );
  for (const p of pins) console.log(JSON.stringify(p));

  await map.screenshot({ path: `${OUT}-map.png` });
  console.log(`wrote ${OUT}-map.png`);
});
