import type { ReactElement } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import {
  useManifestItems,
  useManifestActions,
} from "@plugins/plugin-meta/plugins/composition/web";

/**
 * Auto build & serve section of the composition detail pane. Flips this
 * composition's `autoBuild` config flag; the CLI compose-serve stage reads it
 * from MAIN's resolved config and, when on, composes a per-composition frontend
 * dist + empty DB served live at http://<id>.localhost:9000 on every main build.
 *
 * Keyed by the config item `id` the pane routes on, so the write targets exactly
 * this composition. `item` is undefined for the frame before the manifests config
 * loads (or if the id is stale) — the same null-window the sibling sections guard.
 */
export function AutoServeSection({ id }: { id: string }): ReactElement {
  const item = useManifestItems().find((it) => it.id === id);
  const { setAutoBuild } = useManifestActions();

  if (!item) {
    return (
      <Text variant="caption" tone="muted">
        No composition.
      </Text>
    );
  }

  const host = `${item.id}.localhost:9000`;
  return (
    <Stack gap="sm">
      <Stack direction="row" align="center" gap="sm">
        <ToggleChip
          active={item.autoBuild}
          title={
            item.autoBuild
              ? "Auto-served — click to stop building & serving"
              : `Click to build & serve this composition at http://${host}`
          }
          onClick={() => setAutoBuild(item.id, !item.autoBuild)}
        >
          {item.autoBuild ? "Serving" : "Serve"}
        </ToggleChip>
        {item.autoBuild ? (
          <LinkChip
            mono
            title={`Open http://${host}`}
            onClick={(e) => {
              e.stopPropagation();
              window.open(`http://${host}`, "_blank", "noopener");
            }}
          >
            {host}
          </LinkChip>
        ) : null}
      </Stack>
      <Text variant="caption" tone="muted">
        When on, every main build composes this composition into its own frontend
        dist and empty database and serves it live at {host}. The stage reads
        main’s config, so toggling from a non-main worktree has no effect until it
        lands on main.
      </Text>
    </Stack>
  );
}
