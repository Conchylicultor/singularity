import { useCallback } from "react";
import { MdPublic } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import {
  useStageDefault,
  useStagedValue,
} from "@plugins/config_v2/plugins/staging/web";
import type { ConfigDetailActionContext } from "@plugins/config_v2/plugins/settings/web";

/**
 * The generic "promote my override to the committed git default" affordance for
 * the config settings detail pane.
 *
 * Everything it needs arrives through the `ConfigDetail.Action` context, so it
 * works for *every* `promotableToGit` descriptor with no per-consumer wiring —
 * the two hand-wired triggers that exist today (Studio compositions, reorder
 * edit-mode) become the exception rather than the only way in.
 *
 * Staging only: this writes a worktree-local staged row. Landing it on `main`
 * stays behind the review pane's explicit Apply, exactly as before.
 */
export function PromoteDefaultAction({
  pluginId,
  configName,
  scopeId,
  promotableToGit,
  modified,
  conflictKind,
  value,
}: ConfigDetailActionContext) {
  const stage = useStageDefault();
  const staged = useStagedValue(pluginId, configName);
  const isStaged = staged !== undefined;

  const onClick = useCallback(() => {
    // `stage` is the shared optimistic dispatch (fire-and-forget by design —
    // it returns void). A failed POST is surfaced by the staged-defaults
    // overlay's own never-revert failure path, not swallowed here.
    stage(pluginId, configName, value);
    showToast({
      title: "Staged as the default for everyone",
      description:
        "Nothing is committed yet — open the Review pane to inspect the diff and apply it to main.",
      variant: "success",
    });
  }, [stage, pluginId, configName, value]);

  // A descriptor that never opted into git promotion has no such action at all.
  // Rendering a permanently-disabled button on every one of the ~180 configs
  // would be pure noise, so the affordance simply does not exist there.
  if (!promotableToGit) return null;

  // The stage endpoint is keyed by (pluginId, configName) only — there is no
  // scope axis on the wire, and the land job writes the descriptor's BASE git
  // override. So a scoped promotion is not something to send-and-hope: gate it
  // in the UI and say why, rather than posting what the server can't honor.
  const scoped = scopeId !== undefined;
  // Under an "invalid" conflict the editor resolves to defaults, so `value` is
  // not the user's document — publishing it would quietly promote defaults.
  const unparseable = conflictKind === "invalid";
  const disabled = scoped || unparseable || !modified;

  const tooltip = scoped
    ? "Per-app scopes can't be promoted — the git default is per descriptor. Switch to the Base tab to publish these values."
    : unparseable
      ? "This config's stored values don't match the current schema. Fix or reset them before publishing a default."
      : !modified
        ? "Nothing of yours to publish — this config has no user-layer changes over the committed default."
        : isStaged
          ? "Replace the pending staged default with your current values. Still nothing is pushed until you apply it in the Review pane."
          : "Stage your current values as the committed default for everyone. Nothing is pushed until you apply it in the Review pane.";

  return (
    <Stack direction="row" align="center" gap="xs">
      {isStaged && (
        <Badge variant="info" icon={<MdPublic className="icon-auto" />}>
          Pending review
        </Badge>
      )}
      <WithTooltip content={tooltip}>
        {/* `variant="outline"` (not destructive): publishing a default is
            consequential but additive and fully reversible from the review
            pane. Mirrors Studio's PromoteDefaultButton. */}
        <Button variant="outline" disabled={disabled} onClick={onClick}>
          <MdPublic />
          {isStaged ? "Update default for everyone" : "Set as default for everyone"}
        </Button>
      </WithTooltip>
    </Stack>
  );
}
