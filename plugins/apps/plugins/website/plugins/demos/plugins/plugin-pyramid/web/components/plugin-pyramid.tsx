import type React from "react";
import { useState } from "react";
import { MdKeyboardArrowUp } from "react-icons/md";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { landingPane } from "@plugins/apps/plugins/website/plugins/shell/web";
import { RELEASE_TARGETS } from "@plugins/apps/plugins/website/plugins/demos/plugins/release-switcher/core";
import {
  ComposedVignette,
  PLUGIN_BLOCKS,
  type BlockId,
} from "./composed-vignette";

/** Small muted label sitting above each pyramid tier. */
function TierCaption({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption" tone="muted" className="text-center font-mono">
      {children}
    </Text>
  );
}

/** Upward chevron between tiers — the pyramid reads bottom-up (plugins →
 * app → release). */
function TierChevron() {
  return (
    <MdKeyboardArrowUp className="size-6 text-muted-foreground" aria-hidden />
  );
}

/**
 * The Platform-page pyramid band: an interactive plugins → apps → releases
 * visualization. The visitor toggles the four plugin chips (bottom tier) and
 * watches the sample app's regions (middle tier) appear or empty into labelled
 * slots; the top tier shows the release targets the one composition ships to.
 * The silhouette is a literal pyramid — each tier is narrower going up.
 *
 * Pure local client state, no persistence: the demo teaches slot architecture
 * by making the app visibly the sum of its plugins.
 */
export function PluginPyramidSection() {
  const openPane = useOpenPane();
  const [active, setActive] = useState<ReadonlySet<BlockId>>(
    () => new Set(PLUGIN_BLOCKS.map((b) => b.id)),
  );

  const toggle = (id: BlockId) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="bg-background">
      <Inset x="xl" y="2xl">
        <Stack gap="lg" align="center" className="mx-auto w-full max-w-5xl">
          <Stack gap="2xs" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              The pyramid
            </Text>
            <Text variant="heading" as="h2" className="tracking-tight">
              Plugins compose apps. Apps compose releases.
            </Text>
            <Text variant="body" tone="muted" className="max-w-xl">
              This is how everything here is built. Toggle a plugin off and watch
              its slot empty out — the app is literally the sum of its plugins.
            </Text>
          </Stack>

          <Stack
            gap="md"
            align="center"
            className="w-full"
            aria-label="Plugin pyramid demo"
          >
            {/* Top tier — the release */}
            <TierCaption>the release</TierCaption>
            <Stack
              gap="sm"
              align="center"
              className="mx-auto w-full max-w-sm text-center"
            >
              <Cluster justify="center">
                {RELEASE_TARGETS.map((target) => (
                  <Badge key={target.id} variant="primary" shape="rect">
                    {target.label}
                  </Badge>
                ))}
              </Cluster>
              <Text variant="caption" tone="muted">
                the same composition ships to all three
              </Text>
              <Button
                variant="ghost"
                onClick={() => openPane(landingPane, {}, { mode: "root" })}
              >
                See it morph on the landing page →
              </Button>
            </Stack>

            <TierChevron />

            {/* Middle tier — the app */}
            <TierCaption>the app</TierCaption>
            <div className="mx-auto w-full max-w-xl">
              <ComposedVignette active={active} />
            </div>

            <TierChevron />

            {/* Bottom tier — the plugins */}
            <TierCaption>the plugins</TierCaption>
            <div className="mx-auto w-full max-w-3xl">
              <Cluster justify="center">
                {PLUGIN_BLOCKS.map((block) => (
                  <ToggleChip
                    key={block.id}
                    active={active.has(block.id)}
                    onClick={() => toggle(block.id)}
                    aria-label={`Toggle plugin: ${block.label}`}
                  >
                    {block.label}
                  </ToggleChip>
                ))}
              </Cluster>
            </div>
          </Stack>
        </Stack>
      </Inset>
    </section>
  );
}
