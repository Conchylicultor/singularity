import { type ComponentType, useState } from "react";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { PagesVignette } from "./vignettes/pages-vignette";
import { MailVignette } from "./vignettes/mail-vignette";
import { SonataVignette } from "./vignettes/sonata-vignette";
import { WorkflowsVignette } from "./vignettes/workflows-vignette";

/** The four vignettes, in switch order. Three are toy replicas; the Sonata one
 *  embeds the real keyboard plugin + sampled piano. A local closed list — never
 *  a slot, since the set is fully enumerable here. */
const VIGNETTES: { id: string; label: string; Component: ComponentType }[] = [
  { id: "pages", label: "Pages", Component: PagesVignette },
  { id: "mail", label: "Mail", Component: MailVignette },
  { id: "sonata", label: "Sonata", Component: SonataVignette },
  { id: "workflows", label: "Workflows", Component: WorkflowsVignette },
];

/**
 * The Apps-page "try them" band: a segmented switcher over four interactive app
 * vignettes. Honest by design — Pages, Mail and Workflows are toy replicas, but
 * the Sonata vignette is the REAL Sonata keyboard plugin and sampled grand,
 * embedded. The vignette area is width-constrained with a stable min-height so
 * switching never jumps the page.
 */
export function AppGallerySection() {
  const [activeId, setActiveId] = useState(VIGNETTES[0]?.id ?? "pages");
  const active = VIGNETTES.find((v) => v.id === activeId) ?? VIGNETTES[0];

  const options = VIGNETTES.map((v) => ({ id: v.id, label: v.label }));

  if (!active) return null;
  const Active = active.Component;

  return (
    <section className="bg-background">
      <Inset x="xl" y="2xl">
        <Stack gap="lg" align="center" className="mx-auto w-full max-w-5xl">
          <Stack gap="2xs" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              Try them
            </Text>
            <Text variant="heading" as="h2" className="tracking-tight">
              Four apps, one surface.
            </Text>
            <Text variant="body" tone="muted" className="max-w-xl">
              Pages, Mail and Workflows are toy replicas — but the piano is the
              real thing: the same keyboard plugin and sampled grand the Sonata
              app uses, embedded here. Every app is composed from the same plugin
              building blocks.
            </Text>
          </Stack>
          <div role="group" aria-label="App demo">
            <SegmentedControl
              options={options}
              value={activeId}
              onChange={setActiveId}
            />
          </div>
          <div className="min-h-96 w-full max-w-2xl">
            <Active />
          </div>
        </Stack>
      </Inset>
    </section>
  );
}
