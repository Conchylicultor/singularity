import { useState } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { appsPane } from "@plugins/apps/plugins/website/plugins/pillars/plugins/apps/web";
import { platformPane } from "@plugins/apps/plugins/website/plugins/pillars/plugins/platform/web";
import { SampleVignette } from "@plugins/apps/plugins/website/plugins/demos/plugins/sample-app/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { RELEASE_TARGETS, type ReleaseTargetId } from "../../core";
import { TargetFrame } from "./target-frame";

const TARGET_OPTIONS = RELEASE_TARGETS.map((t) => ({ id: t.id, label: t.label }));

/**
 * Landing band proving "build once, ship three ways": the same composition,
 * re-hosted live as a native desktop app, a standalone web app, or a window
 * inside the equin workspace. The switcher morphs the frame chrome around ONE
 * persistent `<SampleVignette>` — the app never changes, only its host does.
 */
export function ReleaseSwitcherSection() {
  const [target, setTarget] = useState<ReleaseTargetId>("desktop");
  const openPane = useOpenPane();
  const active =
    RELEASE_TARGETS.find((t) => t.id === target) ?? RELEASE_TARGETS[0];
  if (!active) return null;

  return (
    <section className="bg-background">
      <Inset x="xl" y="2xl">
        <Stack gap="lg" align="center" className="mx-auto w-full max-w-5xl">
          <Stack gap="2xs" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              One release engine
            </Text>
            <Text variant="heading" as="h2" className="tracking-tight">
              Build once. Ship three ways.
            </Text>
            <Text variant="body" tone="muted" className="max-w-xl">
              The same plugin composition releases as a native desktop app, a
              standalone web app, or a window inside the equin workspace. Flip
              the target — the app doesn't change.
            </Text>
          </Stack>

          <div role="group" aria-label="Release target">
            <SegmentedControl
              options={TARGET_OPTIONS}
              value={target}
              onChange={setTarget}
            />
          </div>

          <div className="w-full max-w-md">
            <TargetFrame target={target}>
              <SampleVignette />
            </TargetFrame>
          </div>

          <Stack gap="sm" align="center" className="text-center">
            <Text variant="caption" tone="muted">
              {active.tagline}
            </Text>
            <Stack direction="row" gap="sm" justify="center">
              <Button
                variant="ghost"
                onClick={() => openPane(appsPane, {}, { mode: "root" })}
              >
                Explore the apps
              </Button>
              <Button
                variant="ghost"
                onClick={() => openPane(platformPane, {}, { mode: "root" })}
              >
                How the platform works
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Inset>
    </section>
  );
}
