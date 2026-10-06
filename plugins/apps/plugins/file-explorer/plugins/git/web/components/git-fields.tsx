import { useMemo, type ReactNode } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
  FieldOption,
} from "@plugins/primitives/plugins/data-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  absolutePath,
  type EntryRow,
} from "@plugins/apps/plugins/file-explorer/plugins/browser/core";
import {
  useExplorerDir,
  useHomeDir,
} from "@plugins/apps/plugins/file-explorer/plugins/browser/web";
import type { GitChange } from "../../shared/resources";
import { relativeTo } from "../../shared/status-index";
import { useGitView, type GitView } from "../internal/use-git";

/** A folder holding changes below it — its own value, so it filters and groups too. */
const CONTAINS_CHANGES = "contains-changes";
type GitBadge = GitChange | typeof CONTAINS_CHANGES;

const BADGES: Record<GitBadge, { letter: string; option: FieldOption }> = {
  modified: {
    letter: "M",
    option: { value: "modified", label: "Modified", variant: "warning" },
  },
  added: {
    letter: "A",
    option: { value: "added", label: "Added", variant: "success" },
  },
  deleted: {
    letter: "D",
    option: { value: "deleted", label: "Deleted", variant: "destructive" },
  },
  renamed: {
    letter: "R",
    option: { value: "renamed", label: "Renamed", variant: "info" },
  },
  copied: {
    letter: "C",
    option: { value: "copied", label: "Copied", variant: "info" },
  },
  untracked: {
    letter: "?",
    option: { value: "untracked", label: "Untracked", variant: "success" },
  },
  [CONTAINS_CHANGES]: {
    letter: "•",
    option: {
      value: CONTAINS_CHANGES,
      label: "Contains changes",
      variant: "muted",
    },
  },
};
const OPTIONS = Object.values(BADGES).map((b) => b.option);

/** The row's path relative to the checkout, when the view knows its checkout. */
function relOf(
  view: GitView,
  row: EntryRow,
  home: string | null,
): string | null {
  if (view.kind !== "ready" || home === null) return null;
  return relativeTo(view.checkout.rootAsGiven, absolutePath(row.path, home));
}

/** The row's badge: its own status (vs HEAD, else vs main), else a folder's rollup. */
function badgeOf(
  view: GitView,
  row: EntryRow,
  home: string | null,
): GitBadge | null {
  const rel = relOf(view, row, home);
  if (rel === null || view.kind !== "ready") return null;
  const entry = view.index.entry(rel);
  const own = entry?.vsHead ?? entry?.vsMain ?? null;
  if (own !== null) return own;
  if (row.kind === "dir" && view.index.hasChangedDescendant(rel))
    return CONTAINS_CHANGES;
  return null;
}

/** Whether the row changed vs main — or, for a folder, holds a path that did. */
function changedVsMain(
  view: GitView,
  row: EntryRow,
  home: string | null,
): boolean {
  const rel = relOf(view, row, home);
  if (rel === null || view.kind !== "ready") return false;
  if (view.index.entry(rel)?.vsMain != null) return true;
  return row.kind === "dir" && view.index.hasDescendantChangedVsMain(rel);
}

function GitBadgeCell({ badge }: { badge: GitBadge }): ReactNode {
  const { letter, option } = BADGES[badge];
  if (badge === CONTAINS_CHANGES) {
    return (
      <span title={option.label}>
        <StatusDot colorClass="bg-warning" />
      </span>
    );
  }
  return (
    <Badge variant={option.variant} mono title={option.label}>
      {letter}
    </Badge>
  );
}

/**
 * The tree's git fields, for the folder the browser shows: `git` (the status
 * badge — M / A / D / R / C / ?, a dot on a folder holding changes) and
 * `changed` ("Changed vs main", the Filter pill that narrows the tree to a
 * branch's work). Outside a checkout there are none — no empty badge column
 * taking room from the names; while the status (or whether this is a checkout
 * at all) is not known yet the badge cell says so rather than showing the
 * file clean.
 */
export function GitFields({
  render,
}: FieldExtensionProps<EntryRow>): ReactNode {
  const dir = useExplorerDir();
  const homeDir = useHomeDir();
  const home = homeDir.kind === "ready" ? homeDir.home : null;
  const view = useGitView(dir);

  const fields = useMemo<FieldDef<EntryRow>[]>(() => {
    if (view.kind === "none") return [];
    const pending = view.kind === "loading";
    return [
      {
        id: "git",
        label: "Git",
        header: false,
        type: "enum",
        width: "28px",
        align: "center",
        options: OPTIONS,
        value: (r) => badgeOf(view, r, home),
        cell: (r) => {
          if (pending) return <Loading variant="block" className="h-3 w-3" />;
          const badge = badgeOf(view, r, home);
          return badge === null ? null : <GitBadgeCell badge={badge} />;
        },
        ...(view.kind === "failed"
          ? { readError: { error: new Error(view.message) } }
          : {}),
      },
      {
        id: "changed",
        label: "Changed vs main",
        type: "bool",
        visible: false,
        value: (r) => changedVsMain(view, r, home),
        // A filter dimension, not searchable text.
        filterable: false,
      },
    ];
  }, [view, home]);

  return <>{render(fields)}</>;
}
