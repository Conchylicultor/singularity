import { parsePageApplyReport } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/page-tools/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import type {
  ArtifactHit,
  Relation,
} from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";

/**
 * This kind's id. Shared by the contribution and every hit it emits — the host
 * throws on a hit filed under another kind's name, and one const is what makes
 * that impossible here.
 */
export const PAGE_KIND = "page";

type ToolCall = Extract<JsonlEvent, { kind: "tool-call" }>;

/**
 * The three page tools, matched the way their renderers match them: on the
 * SUFFIX. An MCP tool arrives named for its server too
 * (`mcp__singularity__edit_page`), and the prefix is not ours to predict.
 */
const PAGE_TOOLS: { readonly match: RegExp; readonly writes: boolean }[] = [
  { match: /edit_page$/, writes: true },
  { match: /write_agent_note$/, writes: true },
  { match: /read_page$/, writes: false },
];

/**
 * A `<agent-page>` the write MINTS, as opposed to one it merely carries along.
 *
 * The distinction is the `id`: a tagless `<agent-page title="…">` asks for a
 * new sub-page, while `<agent-page id="…" …/>` is a pointer at one that already
 * exists, copied back out of what `read_page` emitted.
 */
const MINTS_PAGE_RE = /<agent-page(?![^>]*\bid=)[^>]*>/;

/** One string field of a tool call's input, or nothing when it is not one. */
function stringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Which page the call acted on.
 *
 * The apply report's `page_id` first: `block_id` names the SCOPE of the write —
 * often a card inside a page rather than the page itself — and the report is
 * where the engine says which page that scope resolved to. A call still in
 * flight, or one that failed, has no report, and then the block id is the only
 * name the row can carry.
 */
function pageKey(event: ToolCall, writes: boolean): string | undefined {
  if (writes) {
    const report = parsePageApplyReport(event);
    // The report is JSON off the wire, so its shape is checked rather than
    // trusted: a tool that answered with some other JSON is not a page id.
    if (typeof report?.page_id === "string" && report.page_id !== "") {
      return report.page_id;
    }
  }
  // `blockId` was the spelling in an earlier revision of these tools; old
  // transcripts carry it.
  return (
    nonEmpty(stringField(event.input, "block_id")) ??
    nonEmpty(stringField(event.input, "blockId"))
  );
}

/** An empty id is no id — it names nothing a row could open. */
function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

/** The text a write puts ON the page — the only place a mint can be asked for. */
function writtenText(event: ToolCall): string {
  return (
    stringField(event.input, "new_string") ??
    stringField(event.input, "content") ??
    ""
  );
}

function relationOf(event: ToolCall, writes: boolean): Relation {
  if (!writes) return "referenced";
  return MINTS_PAGE_RE.test(writtenText(event)) ? "created" : "edited";
}

/**
 * The page one transcript event touched, and what it did to it.
 *
 * - `write_agent_note` / `edit_page` **edited** the page — or **created**, when
 *   the text they wrote mints an `<agent-page>`.
 * - `read_page` **referenced** it.
 *
 * At most one page per event: these tools take one scope each.
 *
 * Known seam: a write is keyed by the page the apply reported, while a read is
 * keyed by whatever `block_id` it was given. So reading one card of a page and
 * then editing it can list the page twice — once under the card's id — until
 * the read carries a report of its own.
 */
export function extractPageHits(event: JsonlEvent): ArtifactHit[] {
  if (event.kind !== "tool-call") return [];
  const tool = PAGE_TOOLS.find((t) => t.match.test(event.name));
  if (tool === undefined) return [];

  const key = pageKey(event, tool.writes);
  // A call that names no page at all — nothing to list, and an empty row would
  // be chrome standing in for information the transcript does not have.
  if (key === undefined) return [];

  return [
    {
      kind: PAGE_KIND,
      key,
      relation: relationOf(event, tool.writes),
      at: event.at,
    },
  ];
}
