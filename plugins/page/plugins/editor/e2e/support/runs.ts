/**
 * Reading a block's PERSISTED runs — `page_blocks.data.text`, as the server
 * stores it.
 *
 * This is the only read that proves a mark travelled the whole way: Lexical →
 * the block's `Y.Doc` → the ~1s `data.text` projection. A DOM-only read passes
 * on a mark that never left the browser, and `selection.format` is not readable
 * from the DOM at all — so every claim about what a keystroke ARMED can only be
 * settled by what gets typed and persisted.
 *
 * A factory rather than free functions: it keeps the call sites reading
 * `settledRuns(page, pageId, blockId)` — the shape the assertions in
 * `mark-boundary-verify.ts` were written against.
 *
 * It used to take `base` and every caller passed the same module-scope
 * `baseUrl()`. `agentFetch` resolves the run's target itself, so the parameter
 * was not just redundant but a way to get it wrong — and an unmarked `fetch`
 * here would create rows no cleanup could attribute. Dropped rather than
 * defaulted.
 */
import type { Page } from "playwright";
import { agentFetch } from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

/** A run exactly as `data.text` stores it — `marks` is absent when empty. */
export interface StoredRun {
  text: string;
  marks?: string[];
  color?: string;
  link?: string;
}

export interface BlockRow {
  id: string;
  type: string;
  data?: { text?: StoredRun[] } | null;
}

/** The shape the assertions compare, so an absent `marks` reads as `[]`. */
export interface NormRun {
  text: string;
  marks: string[];
}

/** Doc flush + the ~1s `data.text` projection, before a persisted-row read. */
export const PROJECTION_MS = 2500;

/**
 * A row's runs, normalized to `{text, marks}`.
 *
 * `report.eq` compares by `JSON.stringify`, so key ORDER would otherwise be part
 * of the assertion — normalizing here keeps the expected literals honest (and
 * `marks: []` an explicit claim rather than a missing key).
 */
export const runsOf = (row: BlockRow | undefined): NormRun[] =>
  (row?.data?.text ?? []).map((run) => ({
    text: run.text,
    marks: run.marks ?? [],
  }));

export interface RunsReader {
  /** Every non-`page` row of the document, by block id. */
  fetchRows(pageId: string): Promise<Map<string, BlockRow>>;
  /** One row's runs, after letting the doc flush and the projection run. */
  settledRuns(page: Page, pageId: string, blockId: string): Promise<NormRun[]>;
}

export function makeRunsReader(): RunsReader {
  const fetchRows = async (pageId: string): Promise<Map<string, BlockRow>> => {
    const res = await agentFetch(`/api/pages/${pageId}/blocks`);
    if (!res.ok) throw new Error(`blocks fetch ${res.status}`);
    const rows = (await res.json()) as BlockRow[];
    return new Map(
      rows.filter((row) => row.type !== "page").map((row) => [row.id, row]),
    );
  };

  return {
    fetchRows,
    async settledRuns(page, pageId, blockId) {
      await page.waitForTimeout(PROJECTION_MS);
      return runsOf((await fetchRows(pageId)).get(blockId));
    },
  };
}
