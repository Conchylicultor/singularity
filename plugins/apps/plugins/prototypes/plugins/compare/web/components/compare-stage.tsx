import type { ReactElement } from "react";
import type { PrototypeStageProps } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { Counterpart, useCounterpartKinds } from "../slots";
import { CounterpartStage } from "./counterpart-stage";
import { MalformedDeclaration, NoDeclaration } from "./notices";

/**
 * The Compare stage: the prototype mock beside the real thing it says it mocks.
 *
 * Three things happen here and nowhere else: the declaration is read off the
 * meta (already parsed on the wire — `none` / `malformed` / `declared`), the
 * declared tag is dispatched to whichever kind plugin handles it, and the kind's
 * answer is handed to the one chrome that renders both halves at one width.
 *
 * The pairing is declarative and one-directional — the prototype names its
 * counterpart in its own `<meta name="mocks">`. Prototypes are host-global and
 * outside git while kinds and their catalogs are per-worktree, so the lookup can
 * only ever happen at runtime, and "this worktree has no such thing" is an
 * ordinary answer, not a fault.
 */
export function CompareStage({
  meta,
  version,
}: PrototypeStageProps): ReactElement {
  const kinds = useCounterpartKinds();
  const decl = meta.mocks;

  if (decl.kind === "none") return <NoDeclaration kinds={kinds} />;
  if (decl.kind === "malformed") {
    return <MalformedDeclaration decl={decl} kinds={kinds} />;
  }

  return (
    <Counterpart.Kind.Dispatch
      kind={decl.tag}
      target={decl.ref}
      meta={meta}
      version={version}
    >
      {(resolution) => (
        <CounterpartStage
          resolution={resolution}
          meta={meta}
          version={version}
        />
      )}
    </Counterpart.Kind.Dispatch>
  );
}
