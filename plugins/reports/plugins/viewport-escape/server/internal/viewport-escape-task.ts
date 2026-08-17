import type { ReportRow } from "@plugins/reports/server";
import { ViewportEscapePayloadSchema } from "../../core";
import type { ViewportEscapePayload } from "../../core";

// Notification re-arm window: the offending declaration is in a stylesheet or a
// component's class list, so the fault reproduces on every activation of that
// surface — every time the user goes fullscreen, every time the overlay opens.
// It is a recurring warning rather than a one-shot crash, so the bell
// resurfaces it every 6h instead of collapsing forever onto the first sighting.
// Same policy as adaptive-bar and render-loop. Lives here (not the barrel) per
// barrel-purity.
export const VIEWPORT_ESCAPE_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function payloadOf(row: ReportRow): ViewportEscapePayload {
  // The row's data was validated by ViewportEscapePayloadSchema at ingest, so
  // this is a total parse; failure would mean a corrupted row, which should
  // surface loudly rather than render a half-empty task.
  return ViewportEscapePayloadSchema.parse(row.data);
}

export function renderViewportEscapeTask(row: ReportRow): {
  title: string;
  description: string;
} {
  return { title: renderTitle(row), description: renderDescription(row) };
}

// One headline per fault kind, in the words of what a user sees rather than
// what the guard is called. A `Record` keyed on the payload union, so a fault
// kind added to the schema cannot ship without prose.
const HEADLINES: Record<ViewportEscapePayload["fault"], string> = {
  "viewport-containing-block": "clipped instead of full-viewport",
  "viewport-stacking-context": "painted under the chrome beside it",
};

function renderTitle(row: ReportRow): string {
  const data = payloadOf(row);
  const noisePrefix = row.noise ? "[noise] " : "";
  const raw = `${noisePrefix}[viewport-escape] ${data.subject} — ${HEADLINES[data.fault]} (${data.blocker})`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

// What each fault means, told as: what the box promised, what the ancestor did,
// and what the user is looking at because of it.
function whatHappened(data: ViewportEscapePayload): string[] {
  switch (data.fault) {
    case "viewport-containing-block":
      return [
        `**${data.subject} is not measured against the viewport.** \`position: fixed\` resolves against the viewport only while no ancestor is a containing block for fixed descendants. \`${data.blocker}\` is one — it declares a \`transform\` / \`translate\` / \`rotate\` / \`scale\` / \`perspective\` / \`filter\` / \`backdrop-filter\`, a \`will-change\` promising one of those, a \`contain\` including layout or paint, or a \`container-type\`. Any one of them makes that element the box's frame of reference.`,
        `So \`inset-0\` means "fill \`${data.blocker}\`", not "fill the window". The box is clipped to that element's content area — typically short by exactly the chrome that sits outside it, which is why it reads as *almost* right and survives review. Nothing errors, because nothing is wrong as far as CSS is concerned; it is only the intent that was lost.`,
      ];
    case "viewport-stacking-context":
      return [
        `**${data.subject} lost a z-index comparison it never entered.** A \`z-index\` is only compared against siblings in the SAME stacking context, and \`${data.blocker}\` opens a new one — \`opacity\` below 1, \`isolation: isolate\`, a \`mix-blend-mode\`, or a positioned element carrying a numeric \`z-index\`. Everything inside is painted as one unit at that element's own level.`,
        `So the box's layer is compared inside \`${data.blocker}\` rather than against the app's chrome, and no amount of raising its own \`z-index\` can win: it is competing in the wrong bracket. The geometry still looks perfectly correct, which is the whole difficulty — the symptom is a rail, a toolbar or a sidebar still painting over something that was supposed to cover it.`,
      ];
  }
}

function renderDescription(row: ReportRow): string {
  const data = payloadOf(row);
  const lines: string[] = [];

  lines.push(...whatHappened(data));
  lines.push("");
  lines.push(`**The auditor's own words**`);
  lines.push(`> ${data.message}`);
  lines.push("");
  lines.push(`**Fault**`);
  lines.push(`- **Kind:** \`${data.fault}\``);
  lines.push(`- **Subject:** ${data.subject}`);
  lines.push(`- **Blocking element:** \`${data.blocker}\``);
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

function howToFix(data: ViewportEscapePayload): string[] {
  const findIt = `Find \`${data.blocker}\` in the DOM — the description is its tag, id and first four classes, which is normally enough to grep for. The walk reports the NEAREST blocker, so this is the one to fix first; there may be another above it.`;
  const common = `The declaration is usually deliberate and belongs to a different feature (a \`transform-gpu\` that scopes some app's own \`fixed\` chrome, a blur or fade on a container, an \`isolation: isolate\` added to tame z-index). Three ways out, in order of preference: **drop it** if it was cargo-culted; **scope it below** the element that hosts the viewport-filling box, so the box's chain is clear; or **make it conditional** on the box being inactive, which is what \`apps-core/surface\` does — it removes \`transform-gpu\` from the surface backdrop for exactly as long as a viewport-relative placement is active.`;

  switch (data.fault) {
    case "viewport-containing-block":
      return [
        findIt,
        common,
        `If the box is a hand-rolled \`fixed inset-0\`, the real fix is upstream: route it through \`<ViewportOverlay>\` (\`plugins/primitives/plugins/css/plugins/viewport-overlay\`), which portals to \`document.body\` and therefore has no in-app ancestor to be captured by. That is the structural version of this fix, and \`no-adhoc-viewport-overlay\` exists to push new code towards it.`,
      ];
    case "viewport-stacking-context":
      return [
        findIt,
        common,
        `Note the deliberate conservatism: a new stacking context on an ancestor that ALSO contains the chrome in question would be harmless, and the walk still reports it — it cannot know which chrome a given consumer has to cover. If that is the case here, the finding is a false positive; say so on the task rather than raising the box's z-index, which cannot help either way.`,
      ];
  }
}
