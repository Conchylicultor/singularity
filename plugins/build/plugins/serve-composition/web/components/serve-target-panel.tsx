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
import {
  asNamespace,
  namespaceHost,
  namespaceUrl,
  MAIN_COMPOSITION_ID,
} from "@plugins/infra/plugins/namespace/core";
import { useServeComposition } from "../internal/use-serve-composition";
import type { ServeStatus } from "../internal/use-serve-status";
import { resetCompositionData } from "../../shared/endpoints";

/** Where a serve build can actually be started — the main app's own host. */
const MAIN_HOST = namespaceHost(asNamespace(MAIN_COMPOSITION_ID));

/**
 * The **Serve live** target panel — the one control for a composition's local
 * deploy, and the one honest statement of whether it is live.
 *
 * Two facts are deliberately kept apart here, because collapsing them is what
 * produced links to namespaces that 502:
 *
 * - **intent** — `item.autoBuild`, the config flag the `ToggleChip` writes. The
 *   CLI compose-serve stage reads it from MAIN's resolved config and composes a
 *   per-composition frontend dist + empty DB on every main build.
 * - **liveness** — the `status` prop, resolved from the `composition.json`
 *   marker compose-serve actually wrote. Only this may produce a link.
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
    status.kind === "ready" && status.live.served ? status.live : null;
  // Compose-serve runs on main only, where the checkout suffix elides and the
  // namespace IS the composition id — Phase 4 is what makes the two a real pair.
  const host = namespaceHost(asNamespace(item.id));
  // Where the refusal SENTENCE goes is a host question (see below), but whether
  // the control can work is not: off main, `serve` writes an intent this backend
  // will never act on and its POST is refused, and `stop` clears a flag main
  // never reads. A live button whose only outcome is an error toast is the
  // "upcoming step rendered inert" rule applied to a chip — and it is what kept
  // this toggle pressable while the list row's own shortcut was already
  // disabled, so two surfaces disagreed about the same fact.
  //
  // `servable` is the second, permanent reason the control cannot work, and it
  // is about the COMPOSITION rather than the backend: compose-serve may never
  // provision main's namespace, because that namespace is where the main
  // checkout's own `./singularity build` deploys. No backend, on any day, can
  // act on this toggle for main — so it is inert everywhere, and its sentence
  // is the one printed first.
  const servable = isServableCompositionId(item.id);
  const canServe = servable && (status.kind !== "ready" || status.canServe);

  return (
    <Stack gap="sm">
      <Stack direction="row" align="center" gap="sm">
        <ToggleChip
          active={item.autoBuild}
          disabled={!canServe}
          title={
            !servable
              ? "The main app is built by ./singularity build — it is not compose-served."
              : !canServe
                ? `Serve builds run on the main instance only — open ${MAIN_HOST}.`
                : item.autoBuild
                  ? "Auto-served — click to stop building & serving"
                  : `Click to build & serve this composition at ${namespaceUrl(asNamespace(item.id))}`
          }
          onClick={() => (item.autoBuild ? stop(item.id) : serve(item.id))}
        >
          {item.autoBuild ? "Serving" : "Serve"}
        </ToggleChip>
        {live && (
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
            {servable && (
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
        {servable ? (
          <>
            When on, every main build composes this composition into its own
            frontend dist and empty database and serves it live at {host}. The
            stage reads main’s config, so toggling from a non-main worktree has
            no effect until it lands on main.
          </>
        ) : (
          <>
            This is the app this repo builds. It is deployed by{" "}
            <code>./singularity build</code> into its own namespace, so there is
            nothing here to switch on — the serve stage never composes it.
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
  // `status.canServe` is deliberately NOT rendered here. It is a fact about the
  // BACKEND, not about this composition, so where the refusal belongs is a
  // question about the host surface — the deploy pane leads with it, while the
  // panel's own caption below already states the main-authoritative rule.
  if (item.autoBuild && !status.live.served) {
    return (
      <Text as="p" variant="caption" tone="muted">
        Enabled, but nothing is served yet — the next main build composes it.
      </Text>
    );
  }
  if (!item.autoBuild && status.live.served) {
    return (
      <Text as="p" variant="caption" tone="muted">
        Still live from an earlier build; the next main build stops serving it.
      </Text>
    );
  }
  return null;
}
