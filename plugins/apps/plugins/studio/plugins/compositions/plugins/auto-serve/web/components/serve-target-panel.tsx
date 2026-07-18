import type { ReactElement } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { openDialog } from "@plugins/primitives/plugins/imperative-dialog/web";
import { useEndpointMutation, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import type { CompositionManifestItem } from "@plugins/plugin-meta/plugins/composition/core";
import { useServeComposition } from "../internal/use-serve-composition";
import { resetCompositionData } from "../../shared/endpoints";
import { ConfirmResetDialog } from "./confirm-reset-dialog";

/**
 * The **Serve live** target panel of the unified Build & serve section. Flips this
 * composition's `autoBuild` config flag; enabling it also kicks an immediate main
 * build (via `useServeComposition().serve`) so the live URL is ready without
 * waiting for the next full build. The CLI compose-serve stage reads `autoBuild`
 * from MAIN's resolved config and, when on, composes a per-composition frontend
 * dist + empty DB served live at http://<id>.localhost:9000 on every main build.
 */
export function ServeTargetPanel({ item }: { item: CompositionManifestItem }): ReactElement {
  const { serve, stop } = useServeComposition();
  // Reset the served composition's own DB + config back to first-launch. Handles
  // its own toasts (success + failure) so `onError` suppresses the global one.
  const reset = useEndpointMutation(resetCompositionData, {
    onError: (err) =>
      showToast({ description: `Reset failed: ${err.message}`, variant: "error" }),
  });

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
          onClick={() => (item.autoBuild ? stop(item.id) : serve(item.id))}
        >
          {item.autoBuild ? "Serving" : "Serve"}
        </ToggleChip>
        {item.autoBuild ? (
          <>
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
            <Button
              variant="destructive"
              aspect="text"
              loading={reset.isPending}
              title={`Wipe ${host}'s database and config back to first-launch (main is untouched)`}
              onClick={() => {
                // Fire-and-forget: don't return the openDialog promise, or the
                // button would auto-pend for the dialog's whole open lifetime.
                // `loading={reset.isPending}` reflects the actual reset instead.
                void openDialog((close) => (
                  <ConfirmResetDialog
                    host={host}
                    onCancel={close}
                    onConfirm={() =>
                      reset
                        .mutateAsync({ body: { id: item.id } })
                        .then(() => {
                          close();
                          showToast({
                            description: `Reset ${host} to first-launch.`,
                            variant: "success",
                          });
                        })
                        .catch((err: unknown) => {
                          // Expected reset failure — onError already toasted it;
                          // keep the dialog open so the user can retry or cancel.
                          if (err instanceof EndpointError) return;
                          throw err;
                        })
                    }
                  />
                ));
              }}
            >
              Reset
            </Button>
          </>
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
