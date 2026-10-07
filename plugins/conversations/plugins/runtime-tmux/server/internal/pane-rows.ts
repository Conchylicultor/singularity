import type { PaneRef } from "./claude-session";

/**
 * The tmux session names this runtime manages. The ONE statement of it: the
 * pane listing (`parsePaneRows`) and every signal route (signals.ts) test this
 * constant, so the sessions the sweep sees and the sessions a signal can name
 * cannot drift apart.
 *
 * It used to be stated twice, the second time as a tmux `-f` filter written
 * `#{r:…}` — not a tmux modifier, so it expanded to its own (non-empty) text
 * and kept every pane. The sweep then adopted hand-made sessions (`spike-auq`)
 * whose changes no signal could ever name
 * (research/2026-10-07-conversations-status-shadow-audit-retirement.md).
 */
export const AGENT_SESSION_RE = /^(conv|claude)-/;

// Field separator: tab (not present in pane paths or titles) keeps splits
// unambiguous even though pane titles can contain arbitrary characters.
const SEP = "\t";

/** The `list-panes -F` format `parsePaneRows` reads. */
export const PANE_ROW_FORMAT = [
  "#{session_name}",
  "#{pane_pid}",
  "#{pane_id}",
  "#{pane_dead}",
  "#{pane_start_path}",
  "#{pane_title}",
].join(SEP);

/**
 * One live pane as `listPanes` reports it. It extends `PaneRef`, so a pane can
 * be handed straight to `resolveSessionState` — the resolver's inputs are a
 * strict subset of what listing a pane already tells us, and there is nothing
 * to assemble (or mis-assemble) at the call site.
 *
 * `#{pane_id}` is the pane's identity for its whole life. `#{window_id}` is
 * deliberately not carried: it moves under `break-pane` / `move-window`, and
 * matching on it would buy nothing that `%pane_id` does not already settle.
 */
export interface TmuxPane extends PaneRef {
  rawTitle: string;
  dead: boolean;
}

/**
 * `list-panes -a -F PANE_ROW_FORMAT` output → the panes of the sessions this
 * runtime manages, keyed by session name (= conversation id). The first pane of
 * a session wins; malformed lines are skipped.
 */
export function parsePaneRows(stdout: string): Map<string, TmuxPane> {
  const map = new Map<string, TmuxPane>();
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    const [name, pidStr, paneId, deadStr, startPath, ...rest] = line.split(SEP);
    if (!name || !pidStr || !paneId) continue;
    if (!AGENT_SESSION_RE.test(name)) continue;
    if (map.has(name)) continue;
    const pid = Number(pidStr);
    if (!Number.isFinite(pid)) continue;
    map.set(name, {
      panePid: pid,
      paneId,
      dead: deadStr === "1",
      worktreePath: startPath ?? "",
      rawTitle: rest.join(SEP),
    });
  }
  return map;
}
