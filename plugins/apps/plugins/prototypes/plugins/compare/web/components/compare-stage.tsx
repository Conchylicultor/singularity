import type { ReactElement } from "react";
import {
  usePrototypeDetail,
  type PrototypeStageProps,
} from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import {
  Counterpart,
  useCounterpartKinds,
  useOfferedCounterparts,
  type OfferedCounterpart,
} from "../slots";
import { useCompareAgainst } from "../against";
import type { CounterpartSpec } from "../types";
import { CounterpartStage } from "./counterpart-stage";
import { MalformedDeclaration, NoDeclaration } from "./notices";

/** The Against control's id for "whatever the prototype declares". */
const DECLARED = "declared";

/**
 * The Compare stage: the document on screen beside a counterpart, at one width.
 *
 * The counterpart is a `<kind>:<ref>` spec from one of two places: the one the
 * reader picked in the Against control (or through a row action, such as the
 * version list's "compare with latest"), else the one the prototype declares
 * in its own `<meta name="mocks">` — the real app thing it is a mockup of.
 * Either way it is dispatched to whichever kind plugin handles the tag, and the
 * kind's answer is handed to the one chrome that renders both halves at one
 * width. This file names no kind.
 *
 * The declaration is one-directional — the prototype names its counterpart.
 * Prototypes are host-global and outside git while kinds and their catalogs are
 * per-worktree, so the lookup can only ever happen at runtime, and "this
 * worktree has no such thing" is an ordinary answer, not a fault.
 */
export function CompareStage({ meta, src }: PrototypeStageProps): ReactElement {
  const kinds = useCounterpartKinds();
  const { shownVersion } = usePrototypeDetail();
  const { picked, setPicked } = useCompareAgainst();
  const offered = useOfferedCounterparts();
  const decl = meta.mocks;
  // One choice is not a choice: with no kind offering a counterpart undeclared,
  // the declared one is all there is, and there is no control.
  const against =
    offered.length === 0 && picked === null ? null : (
      <AgainstControl offered={offered} picked={picked} setPicked={setPicked} />
    );

  const spec: CounterpartSpec | null =
    picked ?? (decl.kind === "declared" ? decl : null);

  if (spec === null) {
    const notice =
      decl.kind === "malformed" ? (
        <MalformedDeclaration decl={decl} kinds={kinds} />
      ) : (
        <NoDeclaration kinds={kinds} />
      );
    if (against === null) return notice;
    return (
      <Column
        className="h-full"
        header={<Bar tier="pane">{against}</Bar>}
        body={notice}
      />
    );
  }

  // The mock half names the version it shows, since the counterpart may be
  // another version of the same prototype.
  const mockSubtitle =
    shownVersion === null ? meta.title : `${meta.title} · v${shownVersion.n}`;

  return (
    <Counterpart.Kind.Dispatch kind={spec.tag} target={spec.ref} meta={meta}>
      {(resolution) => (
        <CounterpartStage
          resolution={resolution}
          meta={meta}
          src={src}
          mockSubtitle={mockSubtitle}
          against={against}
        />
      )}
    </Counterpart.Kind.Dispatch>
  );
}

/**
 * "Against  Declared | Latest version" — what the stage compares with: the
 * declared counterpart, then every counterpart a kind offers undeclared
 * (`useOfferedCounterparts`), then a picked one no kind offers (a row action
 * can pick any spec), spelled as its declaration would be.
 */
function AgainstControl({
  offered,
  picked,
  setPicked,
}: {
  offered: readonly OfferedCounterpart[];
  picked: CounterpartSpec | null;
  setPicked: (spec: CounterpartSpec | null) => void;
}): ReactElement {
  const options = [
    { id: DECLARED, label: "Declared" },
    ...offered.map((o) => ({ id: specId(o.spec), label: o.label })),
  ];
  if (picked !== null && !options.some((o) => o.id === specId(picked))) {
    options.push({ id: specId(picked), label: specId(picked) });
  }
  const byId = new Map(offered.map((o) => [specId(o.spec), o.spec]));

  return (
    <Stack direction="row" gap="sm" align="center">
      <Text variant="label">Against</Text>
      <SegmentedControl<string>
        options={options}
        value={picked === null ? DECLARED : specId(picked)}
        onChange={(id) => {
          if (id === DECLARED) setPicked(null);
          else setPicked(byId.get(id) ?? picked);
        }}
      />
    </Stack>
  );
}

/** A spec written the way a declaration spells it. */
function specId(spec: CounterpartSpec): string {
  return `${spec.tag}:${spec.ref}`;
}
