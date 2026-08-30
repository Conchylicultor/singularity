import type { ReactNode } from "react";
import type {
  FieldDef,
  FieldOption,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { armBool, armText, runArmFields } from "@plugins/runs/web";
import type { UnionRun } from "@plugins/runs/core";
import type { ReleaseRun } from "@plugins/release/core";
import { releaseRunArmFields } from "../../core";

// Bound once against this arm's own column declaration: the id must be declared,
// and its declared type must be one the accessor can read, or it does not
// compile. `runArmFields` makes the same binding for the `FieldDef.id` below.
const kindOf = armText(releaseRunArmFields, "release.kind");
const compositionOf = armText(releaseRunArmFields, "release.composition");
const targetOf = armText(releaseRunArmFields, "release.target");
const platformOf = armText(releaseRunArmFields, "release.platform");
const commitShaOf = armText(releaseRunArmFields, "release.commitSha");
const commitDirtyOf = armBool(releaseRunArmFields, "release.commitDirty");
const artifactPathOf = armText(releaseRunArmFields, "release.artifactPath");

/**
 * The two ways a release run is cut, and how each reads.
 *
 * A `Record<ReleaseRun["kind"], …>` rather than a hand-written option array, so
 * a third kind is a `tsc` error here rather than a value that filters to nothing
 * because the dropdown never offered it. Same technique as the server's outcome
 * map, for the same reason.
 */
const KIND_META: Record<ReleaseRun["kind"], { label: string; hint: string }> = {
  staged: {
    label: "Staged",
    hint: "A --dev run: previewable, claiming no latest-<platform> pointer.",
  },
  candidate: {
    label: "Candidate",
    hint: "Packed and built for a named platform — a bundle `ship` can pick.",
  },
};

const KIND_OPTIONS: FieldOption[] = (
  Object.entries(KIND_META) as [
    ReleaseRun["kind"],
    (typeof KIND_META)[ReleaseRun["kind"]],
  ][]
).map(([value, meta]) => ({ value, label: meta.label, hint: meta.hint }));

/**
 * The dimensions only a release row has.
 *
 * Every cell survives being rendered on a row of another kind: the table view is
 * strictly field-driven, so a build row still gets a `Platform` cell — blank,
 * because the column is NULL there. Nothing here checks the kind; reading the
 * projected column is enough, which is what a null projection is for.
 *
 * Most are off by default. The merged surface's job is "what is running on this
 * machine", and seven release columns on by default would push every other
 * kind's row off the right edge of the table to say things only one kind can
 * say. They stay one click away in the view's Properties list, and they filter,
 * sort and group whether or not they are shown.
 */
const FIELDS: FieldDef<UnionRun>[] = runArmFields(releaseRunArmFields, [
  {
    id: "release.kind",
    label: "Release kind",
    type: "enum",
    value: kindOf,
    options: KIND_OPTIONS,
    sortable: true,
    filterable: true,
    groupable: true,
    width: "9rem",
  },
  {
    id: "release.composition",
    label: "Composition",
    type: "text",
    value: compositionOf,
    sortable: true,
    filterable: true,
    // The one release dimension worth a column by default: it is what a person
    // means by "which release", and grouping runs by it is the obvious question.
    groupable: true,
    width: "10rem",
  },
  {
    id: "release.target",
    label: "Target",
    type: "text",
    value: targetOf,
    sortable: true,
    filterable: true,
    visible: false,
    width: "9rem",
  },
  {
    id: "release.platform",
    label: "Platform",
    type: "text",
    value: platformOf,
    sortable: true,
    filterable: true,
    visible: false,
    width: "9rem",
  },
  {
    id: "release.commitSha",
    label: "Commit",
    type: "text",
    value: commitShaOf,
    cell: (run) => {
      const sha = commitShaOf(run);
      if (sha === null) return null;
      // The dirty flag belongs ON the sha, not beside it: a dirty run's sha names
      // its PARENT commit, not its bytes, so the sha alone is a claim the row
      // cannot support. Rendering them apart lets someone read the first without
      // the second.
      const dirty = commitDirtyOf(run);
      return (
        <Badge
          variant={dirty === true ? "warning" : "muted"}
          mono
          title={dirty === true ? `${sha} (tree was dirty)` : sha}
        >
          {sha.slice(0, 8)}
          {dirty === true ? "+" : ""}
        </Badge>
      );
    },
    filterable: true,
    visible: false,
    width: "8rem",
  },
  {
    id: "release.commitDirty",
    label: "Dirty tree",
    type: "bool",
    value: commitDirtyOf,
    filterable: true,
    groupable: true,
    visible: false,
    width: "6rem",
  },
  {
    id: "release.artifactPath",
    label: "Artifact",
    type: "text",
    value: artifactPathOf,
    cell: (run) => {
      const path = artifactPathOf(run);
      return path === null ? null : (
        <span className="text-muted-foreground" title={path}>
          {path}
        </span>
      );
    },
    filterable: true,
    visible: false,
    width: "20rem",
  },
]);

export function ReleaseRunFields({
  render,
}: FieldExtensionProps<UnionRun>): ReactNode {
  return <>{render(FIELDS)}</>;
}
