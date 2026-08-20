import type { ReactElement } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { confirmDialog } from "@plugins/primitives/plugins/imperative-dialog/plugins/confirm/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import {
  isServableCompositionId,
  type CompositionManifestItem,
} from "@plugins/plugin-meta/plugins/composition/core";
import { useServeComposition } from "../internal/use-serve-composition";
import type { ServeStatus } from "../internal/use-serve-status";
import { resetCompositionData } from "../../shared/endpoints";

/**
 * The **Serve live** target panel — the one control for a composition's local
 * deploy, and the one honest statement of whether it is live.
 *
 * Two facts are deliberately kept apart here, because collapsing them is what
 * produced links to namespaces that 502:
 *
 * - **intent** — `item.autoBuild`, the config flag the `ToggleChip` writes.
 * - **liveness** — the `status` prop, resolved from the `composition.json`
 *   marker a serve build actually wrote. Only this may produce a link, and only
 *   it knows the namespace: a composition is served from whichever checkout
 *   built it, so the host is server-resolved rather than composed here.
 *
 * `status` is a prop rather than a hook call so a host that already needs the
 * answer for an affordance of its own (a list row's shortcut, say) asks once and
 * hands the same snapshot to the panel.
 */
export function ServeTargetPanel({
  item,
  status,
}: {
  item: CompositionManifestItem;
  status: ServeStatus;
}): ReactElement {
  const { serve, stop } = useServeComposition();
  // Reset the served composition's own DB + config back to first-launch. Handles
  // its own toasts (success + failure) so `onError` suppresses the global one.
  const reset = useEndpointMutation(resetCompositionData, {
    onError: (err) =>
      showToast({
        description: `Reset failed: ${err.message}`,
        variant: "error",
      }),
  });

  const live =
    status.kind === "ready" && status.live.served
      ? { ...status.live, url: status.url }
      : null;
  // The namespace this composition is served under, as the SERVER resolved it
  // from its own checkout — `sonata` from main, `sonata.att-x` from a worktree.
  // Null while the read is in flight, which is the honest state: the panel does
  // not know the address yet and must not invent one, so the copy below falls
  // back to the composition's own name.
  const host = status.kind === "ready" ? status.host : null;
  // The one permanent reason the control cannot work, and it is about the
  // COMPOSITION rather than the backend: a serve may never provision main's
  // namespace, because that namespace is where the checkout's own
  // `./singularity build` deploys. A live button whose only outcome is an error
  // toast is the "upcoming step rendered inert" rule applied to a chip.
  //
  // There is no longer a second, backend-shaped reason. Serving used to run
  // inside MAIN's build, so every other backend could only observe and the
  // server answered `canServe` for it; a serve is now an ordinary build of this
  // checkout, so the question collapses into this one — synchronous, and true
  // before the liveness read has even settled.
  const canServe = isServableCompositionId(item.id);

  return (
    <Stack gap="sm">
      <Stack direction="row" align="center" gap="sm">
        <ToggleChip
          active={item.autoBuild}
          disabled={!canServe}
          title={
            !canServe
              ? "The main app is built by ./singularity build — it is not served as a composition."
              : item.autoBuild
                ? "Serving — click to clear the serve intent"
                : host !== null
                  ? `Click to build & serve this composition at ${host}`
                  : "Click to build & serve this composition from this checkout"
          }
          onClick={() => (item.autoBuild ? stop(item.id) : serve(item.id))}
        >
          {item.autoBuild ? "Serving" : "Serve"}
        </ToggleChip>
        {live && host !== null && (
          <>
            <LinkChip
              mono
              title={`Open ${live.url}`}
              onClick={(e) => {
                e.stopPropagation();
                window.open(live.url, "_blank", "noopener");
              }}
            >
              {host}
            </LinkChip>
            <Badge variant="muted" mono title={live.commit ?? undefined}>
              {live.commit ? live.commit.slice(0, 7) : "no commit recorded"}
            </Badge>
            <Badge variant="muted">
              built <RelativeTime date={new Date(live.builtAt)} />
            </Badge>
            {/* No Reset for a non-servable namespace. `resetCompositionData`
                refuses it at its first guard (assertServableCompositionNamespace),
                so the button could only ever produce an error toast — offering it
                is worse than not offering it. */}
            {canServe && (
              <Button
                variant="destructive"
                aspect="text"
                loading={reset.isPending}
                title={`Wipe ${host}'s database and config back to first-launch (main is untouched)`}
                onClick={() => {
                  // Fire-and-forget: confirmDialog owns the dialog lifetime and the
                  // keep-open-on-failure retry. `loading={reset.isPending}` reflects
                  // the actual reset instead of the dialog's open lifetime.
                  void confirmDialog({
                    title: `Reset ${host} to first-launch?`,
                    description: (
                      <>
                        This wipes this composition&apos;s database and config
                        so you see exactly what a new user gets. The main
                        app&apos;s data (the <code>singularity</code> database
                        and its config) is not touched.
                      </>
                    ),
                    confirmLabel: "Reset to first-launch",
                    onConfirm: async () => {
                      await reset.mutateAsync({ body: { id: item.id } });
                      showToast({
                        description: `Reset ${host} to first-launch.`,
                        variant: "success",
                      });
                    },
                  });
                }}
              >
                Reset
              </Button>
            )}
          </>
        )}
      </Stack>
      <ServeStatusNote item={item} status={status} />
      <Text as="p" variant="caption" tone="muted">
        {canServe ? (
          <>
            Serving runs{" "}
            <code>./singularity build --composition {item.id}</code> in THIS
            checkout: its own frontend dist and empty database, live at{" "}
            {host ?? `${item.id}.<this checkout>`}. Two checkouts serving the
            same composition get two namespaces and two databases.
          </>
        ) : (
          <>
            This is the app this repo builds. It is deployed by{" "}
            <code>./singularity build</code> into this checkout’s own namespace,
            so there is nothing here to switch on.
          </>
        )}
      </Text>
    </Stack>
  );
}

/**
 * The sentence for whatever intent and liveness currently disagree about — the
 * states an `autoBuild`-only surface used to render as a flat "Serving".
 */
function ServeStatusNote({
  item,
  status,
}: {
  item: CompositionManifestItem;
  status: ServeStatus;
}): ReactElement | null {
  if (status.kind === "pending") {
    return (
      <Text as="p" variant="caption" tone="muted">
        Checking what is actually served…
      </Text>
    );
  }
  if (status.kind === "error") {
    // Loud, not swallowed: an unreadable marker means this surface cannot say
    // whether the namespace is live, and it must not imply that it is.
    return (
      <Text as="p" variant="caption" tone="destructive">
        Could not read the serve state: {status.message}
      </Text>
    );
  }
  if (item.autoBuild && !status.live.served) {
    return (
      <Text as="p" variant="caption" tone="muted">
        Enabled, but nothing is served at {status.host} yet — the serve build
        has not finished (or it failed).
      </Text>
    );
  }
  if (!item.autoBuild && status.live.served) {
    // Deliberately NOT "the next main build stops serving it": auto-serve and
    // its deactivation sweep are gone, so nothing takes a served namespace down
    // on its own any more. Reclaiming one is Phase 5 of
    // research/2026-08-17-global-composition-build-serve-model.md.
    return (
      <Text as="p" variant="caption" tone="muted">
        The serve intent is off, but {status.host} is still live from an earlier
        build.
      </Text>
    );
  }
  return null;
}
