import type { ReactElement } from "react";
import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { CounterpartKindMeta, CounterpartKindProps } from "./types";
import { KindExamples } from "./components/notices";

/**
 * The counterpart-kind registry. OPEN by construction: the kind set is whatever
 * is contributed, and this plugin names none of them — it parses
 * `<kind>:<ref>`, dispatches on the tag, and owns the chrome. A new kind is a
 * sibling plugin folder under `plugins/`.
 *
 * A dispatch slot: exactly one contribution renders, matched on the tag, with
 * a fallback for "nothing handles this kind" — and it is not reorderable, so it
 * owes no config override.
 *
 * The fallback lives in this module because it reads the registry it falls
 * back from: a fallback file importing the slot, while the slot imports the
 * fallback, would be an import cycle.
 */
export const Counterpart = {
  Kind: defineDispatchSlot<CounterpartKindProps, string, CounterpartKindMeta>({
    key: (p) => p.kind,
    fallback: UnknownKind,
    docLabel: (c) => c.label,
  }),
};

/**
 * Every registered kind's self-description, in registration order. What the
 * notices list; never what the stage dispatches on — that is the slot's job.
 */
export function useCounterpartKinds(): readonly CounterpartKindMeta[] {
  return Counterpart.Kind.useContributions();
}

/**
 * The dispatch fallback: the declaration names a kind nothing here handles.
 *
 * Rendered through the same `children(resolution)` path as a kind that handles
 * the tag but cannot resolve the ref, so the stage's chrome (the mock half, the
 * header) is identical in both — only the sentence differs, and the reader can
 * tell "no such kind" from "no such fixture" at a glance.
 */
function UnknownKind({ kind, children }: CounterpartKindProps): ReactElement {
  const kinds = useCounterpartKinds();
  return (
    <>
      {children({
        status: "unresolved",
        title: (
          <>
            Nothing in this worktree shows a <Badge mono>{`${kind}:`}</Badge>{" "}
            counterpart.
          </>
        ),
        detail: (
          <Stack gap="sm">
            <Text variant="body" tone="muted">
              Prototypes live outside the repo and are shared by every worktree,
              while counterpart kinds are per-worktree plugins — so a prototype
              can name a kind that only exists on another branch. The kinds this
              worktree knows:
            </Text>
            <KindExamples kinds={kinds} />
          </Stack>
        ),
      })}
    </>
  );
}
