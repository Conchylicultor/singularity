import type { ReportRow } from "@plugins/reports/server";
import { AdaptiveBarPayloadSchema } from "../../core";
import type { AdaptiveBarPayload } from "../../core";

// Notification re-arm window: a bar in a broken host produces its fault again on
// every mount of that surface — every time the pane is opened, every time the
// toolbar remounts — so this is a recurring warning, not a one-shot crash. The
// bell resurfaces it every 6h rather than collapsing forever onto the first
// sighting. Same policy as optimistic-divergence and render-loop. Lives here
// (not the barrel) per barrel-purity.
export const ADAPTIVE_BAR_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function payloadOf(row: ReportRow): AdaptiveBarPayload {
  // The row's data was validated by AdaptiveBarPayloadSchema at ingest, so this
  // is a total parse; failure would mean a corrupted row, which should surface
  // loudly rather than render a half-empty task.
  return AdaptiveBarPayloadSchema.parse(row.data);
}

export function renderAdaptiveBarTask(row: ReportRow): {
  title: string;
  description: string;
} {
  return { title: renderTitle(row), description: renderDescription(row) };
}

// One headline per fault kind, in the words a human picking the task up needs:
// what the bar found, not what the guard is called. A `Record` keyed on the
// payload union, so a fault kind added to the schema cannot ship without prose.
const HEADLINES: Record<AdaptiveBarPayload["fault"], string> = {
  "no-slack": "adaptive bar was given no slack",
  "row-overflow": "adaptive bar's fit disagrees with the layout engine",
  "no-convergence": "adaptive bar never converged",
  "iframe-relocation": "adaptive bar refused to relocate an iframe",
};

function renderTitle(row: ReportRow): string {
  const data = payloadOf(row);
  const noisePrefix = row.noise ? "[noise] " : "";
  const raw = `${noisePrefix}[adaptive-bar] ${HEADLINES[data.fault]} — ${data.label}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

// What each fault means, told as: what the bar assumed, what it observed, and
// what it did about it. Everything here is fault-specific; the shared parts (the
// contract, the fix, the report metadata) are appended by renderDescription.
function whatHappened(data: AdaptiveBarPayload): string[] {
  switch (data.fault) {
    case "no-slack":
      return [
        `The bar **"${data.label}" was not given any room to give**. It declares itself \`min-w-0 flex-1\` precisely so that \`barRoot.getBoundingClientRect().width\` **is** the available width — no ancestor walk, no mutate-reflow-restore. At its first laid-out pass this bar's root computed \`flex-grow: 0\`, which means that premise is false: the number it is reading is the width of a shrink-to-content box (or of a row where a \`Fill\`/\`flex-1\` sibling took the slack), not the width it was given.`,
        `Everything downstream inherits the lie. A bar that measures a content-sized box always "fits", so it never compacts and never relocates — the row simply spills out of its parent — or, in a parent that clips, occupants silently disappear. The bar keeps operating; it has no way to fix this from the inside, which is why it says so instead.`,
      ];
    case "row-overflow":
      return [
        `The bar **"${data.label}" blessed a row that then did not fit**. On a converged pass — the placement stopped changing, so what is rendered *is* what the fit decided — the fit reported \`fits: true\`, and the union of the occupants' own rendered boxes still stuck out of the bar's own content box, on one side or the other. Those two statements cannot both be true, so one of the widths the fit decided from is not a width this row actually has.`,
        `That is a genuine contradiction rather than a cramped row: overflow alone is handled structurally (the bar clips or scrolls by CSS) and is never reported. The usual causes are a widget whose rendered width does not match what it measured at that rung (an async font, a late-loading icon, a transition mid-flight), or a bar hosted somewhere its width reading does not describe — the same premise the \`no-slack\` guard covers, seen from the other end.`,
      ];
    case "no-convergence":
      return [
        `The bar **"${data.label}" could not settle**. Each measure→decide round produced a different placement, and the answer was still changing after the maximum number of rounds. The fit is deliberately current-state-independent apart from pins and hysteresis, so a stable set of widths converges in at most a few passes; not converging means the widths themselves are moving under it.`,
        `The usual cause is a widget whose width depends on the rung it is rendered at in a way that feeds back — it is wider when compacted, or its content reflows in response to being placed — so demoting it makes the row need a promotion, and promoting it makes the row need a demotion. An animating or continuously-resizing occupant produces the same shape.`,
      ];
    case "iframe-relocation":
      return [
        `The bar **"${data.label}" left an occupant in the row that it wanted to move out**. That occupant contains an \`<iframe>\`, and this browser has no state-preserving \`moveBefore()\` — so re-parenting it into the overflow panel would tear the frame down and **reload it**, losing whatever is inside.`,
        `The bar refused, deliberately: silently reloading a user's embedded content is worse than a row that stays wider than it wanted to be. This is the one fault the *browser* causes rather than the consumer — nothing in the host's layout is wrong, and the report exists so the trade-off is visible instead of mysterious. It resolves by itself on any engine that ships \`moveBefore()\`.`,
      ];
  }
}

// What the bar did with the row after the fault — the part that explains what a
// user is looking at right now. Two of the four faults surrender the mount.
function whatTheBarDid(data: AdaptiveBarPayload): string {
  switch (data.fault) {
    case "no-slack":
      return `Nothing — the bar carried on fitting from the width it was handed, because there is no better number available to it. Whatever the row looks like on that surface, it was decided from a width that does not mean what the bar thinks it means.`;
    case "row-overflow":
    case "no-convergence":
      return `It committed the **floor layout**: every unpinned occupant at its narrowest rung, everything that can leave the row moved into the overflow panel. That is the one configuration that cannot overflow. It then **stopped re-deciding at that width** — because re-deriving from the same broken premise can only reproduce the same fault, and a bar that keeps re-deciding through a fault is a render loop rather than a cramped row. A genuine resize re-arms it (the premise it failed under is gone), up to a small cap per mount, so a *transient* fault costs one cramped render rather than a toolbar parked in the overflow panel until the pane is reopened. Items that mount or unmount afterwards are still placed against that committed floor. So the user sees a **usable but unnecessarily cramped** bar, not a broken pane.`;
    case "iframe-relocation":
      return `It pinned that occupant inline for good and re-fitted everything else around it. The row may therefore be wider than the bar would otherwise have allowed, and other occupants may have been relocated in its place.`;
  }
}

function howToFix(data: AdaptiveBarPayload): string[] {
  const findTheBar = `Find the \`<AdaptiveBar label="${data.label}">\` (or \`<AdaptiveBar.Collapsed label="${data.label}">\`) — the label is the bar's only name, and it is authored at the call site.`;
  switch (data.fault) {
    case "no-slack":
      return [
        findTheBar,
        `Then satisfy the one rule for consumers (\`plugins/primitives/plugins/adaptive-bar/CLAUDE.md\`): **put the bar where there is slack to give** — as the growing cell of a single-line row (\`Line\` / \`Row\` / \`Bar\`), with **no \`Fill\` or other \`flex-1\` sibling** competing for the same slack, and **never inside a shrink-to-content parent** (\`inline-flex\`, \`w-fit\`, \`Cluster\`). One adaptive bar per row. In practice it is almost always one of three things: a \`Fill\` next to the bar that should be deleted (the bar *is* the fill), a \`Cluster\`/\`Inline\` wrapper around it that should be a \`Line\`, or a second bar in the same row.`,
      ];
    case "row-overflow":
      return [
        findTheBar,
        `First re-check the host against the one rule for consumers (see \`plugins/primitives/plugins/adaptive-bar/CLAUDE.md\`): the bar must be the growing cell of a single-line row, with no \`Fill\`/\`flex-1\` sibling and no shrink-to-content ancestor. If the host is right, the disagreement is in an occupant: look for one whose rendered width differs from what it measured — content that arrives after the measurement (an icon font, a lazily-loaded label, a number that grows), a CSS transition on a bar item (never animate one; animate the panel), or a \`position: sticky\` inside an item, which is unsupported. Reproduce it in the layout-geometry harness (\`./singularity check layout-geometry\`) rather than by eye — the guard only runs when a real layout engine answered.`,
      ];
    case "no-convergence":
      return [
        findTheBar,
        `Then look for an occupant whose width is not a function of its rung alone. Render each of that bar's items at each declared form and compare the measured widths: a compact form that is not narrower than the form above it is the classic offender, and so is any item that animates, or that reflows its own content in response to being resized. If every item measures monotonically, the next suspect is the host — a parent whose own width responds to the bar's (a shrink-to-content ancestor, or a sibling that grows as the bar shrinks) closes the same feedback loop from outside.`,
      ];
    case "iframe-relocation":
      return [
        findTheBar,
        `There is nothing to fix in the bar. Decide whether that occupant belongs in an adaptive bar at all: an \`<iframe>\` is the one payload that cannot survive a fallback re-parent, so if it must be in the row, it will simply stay there on engines without \`moveBefore()\`. If the row is now too crowded because of it, give that surface fewer bar occupants, or host the frame outside the bar.`,
      ];
  }
}

function renderDescription(row: ReportRow): string {
  const data = payloadOf(row);
  const lines: string[] = [];

  lines.push(...whatHappened(data));
  lines.push("");
  lines.push(`**The primitive's own words**`);
  lines.push(`> ${data.message}`);
  lines.push("");
  lines.push(`**What the bar did about it**`);
  lines.push(whatTheBarDid(data));
  lines.push("");
  lines.push(`**Fault**`);
  lines.push(`- **Kind:** \`${data.fault}\``);
  lines.push(`- **Bar:** \`${data.label}\``);
  lines.push("");
  lines.push(`**Report**`);
  lines.push(`- **Source:** ${row.source}`);
  lines.push(`- **Worktree:** ${row.worktree}`);
  lines.push(`- **Fingerprint:** ${row.fingerprint}`);
  lines.push(`- **Count:** ${row.count}`);
  lines.push(`- **First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`- **Last seen:** ${row.lastSeenAt.toISOString()}`);
  if (row.url) lines.push(`- **URL:** ${row.url}`);
  if (row.userAgent) lines.push(`- **User-Agent:** ${row.userAgent}`);
  lines.push("");
  lines.push(`**How to fix**`);
  lines.push(...howToFix(data));
  return lines.join("\n");
}
