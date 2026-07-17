import { useState, type ReactElement } from "react";
import { MdBolt, MdLanguage, MdPlayArrow } from "react-icons/md";
import type { IconType } from "react-icons";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useManifestItems } from "@plugins/plugin-meta/plugins/composition/web";
import { RELEASE_TARGETS, triggerReleaseEndpoint } from "@plugins/release/core";
import { ServeTargetPanel } from "@plugins/apps/plugins/studio/plugins/compositions/plugins/auto-serve/web";

// The "Serve live" pseudo-target. Deliberately NOT in RELEASE_TARGETS — that core
// list drives real release build-args + the server validator; "serve" is a
// UI-only target that routes to the serve capability, not a release build.
const SERVE_TARGET = { id: "serve", label: "Serve live", implemented: true };
const PICKER_TARGETS = [SERVE_TARGET, ...RELEASE_TARGETS];

// Web-only icon decoration for the target list (the engine carries no icon —
// the server must not import a UI component, so the web attaches a glyph by id).
const TARGET_ICONS: Record<string, IconType> = { serve: MdBolt, web: MdLanguage };

function TargetPicker({
  target,
  onPick,
}: {
  target: string | null;
  onPick: (id: string) => void;
}): ReactElement {
  return (
    <Cluster gap="sm">
      {PICKER_TARGETS.map((t) => {
        const Icon = TARGET_ICONS[t.id];
        return (
          <ToggleChip
            key={t.id}
            active={target === t.id}
            disabled={!t.implemented}
            icon={Icon ? <Icon /> : undefined}
            onClick={() => onPick(t.id)}
            title={t.implemented ? t.label : `${t.label} (coming soon)`}
          >
            {t.implemented ? t.label : `${t.label} (soon)`}
          </ToggleChip>
        );
      })}
    </Cluster>
  );
}

export function ReleaseSection({ id }: { id: string }): ReactElement {
  const item = useManifestItems().find((it) => it.id === id);
  const [target, setTarget] = useState<string | null>("serve");
  const trigger = useEndpointMutation(triggerReleaseEndpoint);

  const name = item?.name;
  // Only apps are releasable — the other categories (profile / subsystem / pack)
  // are inspection lenses with no product to build. Serving, however, is
  // available for ALL categories.
  const releasable = item?.category === "app";
  const canRun = name !== undefined && releasable && target !== null && !trigger.isPending;

  return (
    <Stack gap="sm">
      <Stack gap="2xs">
        <Text as="span" variant="label" className="text-muted-foreground">
          Target
        </Text>
        <TargetPicker target={target} onPick={setTarget} />
      </Stack>

      {target === "serve" ? (
        item ? (
          <ServeTargetPanel item={item} />
        ) : null
      ) : (
        <>
          <Button
            variant="default"
            loading={trigger.isPending}
            disabled={!canRun}
            onClick={() => {
              if (name && target) trigger.mutate({ body: { composition: name, target } });
            }}
          >
            <MdPlayArrow className="size-4" />
            Run release
          </Button>

          {item && !releasable && (
            <Text as="p" variant="caption" className="text-muted-foreground">
              Only <code>app</code> compositions are releasable — this one is a{" "}
              <code>{item.category}</code>.
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}
