import { z } from "zod";

/**
 * Structured inline rich-text model (Notion-style runs) stored in `data.text`.
 *
 * `data.text` is `string | RichText`. A legacy plain string is a single unmarked
 * run; `runsOf` coerces `string | RichText → RichText` and `plainOf` flattens
 * back to a plain string. New writes always persist arrays. This is the single
 * back-compat seam — no DB migration.
 *
 * Page-link tokens (`[[<pageId>]]`) live inside run `text`, so `plainOf` still
 * yields them and the backlinks extractor / `BlockTextExtension` token mechanism
 * are unchanged. Marks are a parallel, additive concern layered on top.
 */

/** Inline boolean formatting flags. */
export type Mark = "bold" | "italic" | "underline" | "strikethrough" | "code";

/**
 * Canonical mark ordering. Marks arrays are always stored sorted in this fixed
 * order so serialization is deterministic and equality is a plain `===` on the
 * JSON form.
 */
export const MARK_ORDER: readonly Mark[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
];

const MARK_RANK = new Map<Mark, number>(MARK_ORDER.map((m, i) => [m, i]));

/** Sort a marks array into the canonical order (stable, deduped). */
export function sortMarks(marks: readonly Mark[]): Mark[] {
  const seen = new Set<Mark>();
  for (const m of marks) seen.add(m);
  return [...seen].sort((a, b) => (MARK_RANK.get(a) ?? 0) - (MARK_RANK.get(b) ?? 0));
}

/** Closed text-color palette (theme tokens, no ad-hoc hex). */
export type ColorToken =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export const COLOR_TOKENS: readonly ColorToken[] = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

/** A contiguous span of text sharing the same marks / color / link. */
export interface TextRun {
  /** May contain "\n" soft breaks and `[[<pageId>]]` tokens. */
  text: string;
  /** Omitted when none; always stored canonically sorted. */
  marks?: Mark[];
  /** Omitted / "default" when none. */
  color?: ColorToken;
  /** Href; omitted when none. */
  link?: string;
}

export type RichText = TextRun[];

const MarkSchema = z.enum(["bold", "italic", "underline", "strikethrough", "code"]);
const ColorTokenSchema = z.enum([
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
]);

export const TextRunSchema = z.object({
  text: z.string(),
  marks: z.array(MarkSchema).optional(),
  color: ColorTokenSchema.optional(),
  link: z.string().optional(),
});

/** The persisted `data.text` shape: a legacy string OR an array of runs. */
export const RichTextSchema = z.union([z.string(), z.array(TextRunSchema)]);

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

/**
 * Coerce `string | RichText | unknown → RichText`. A non-empty string becomes a
 * single unmarked run; `""` becomes `[]`; an already-array value is validated and
 * passed through; anything else becomes `[]`.
 */
export function runsOf(value: unknown): RichText {
  if (typeof value === "string") {
    return value.length > 0 ? [{ text: value }] : [];
  }
  if (Array.isArray(value)) {
    const parsed = z.array(TextRunSchema).safeParse(value);
    return parsed.success ? parsed.data : [];
  }
  return [];
}

/**
 * Flatten a `string | RichText | unknown` to a plain string (concatenate run
 * texts). Preserves `[[<pageId>]]` tokens verbatim so the backlinks extractor
 * keeps working.
 */
export function plainOf(value: unknown): string {
  if (typeof value === "string") return value;
  return runsOf(value)
    .map((r) => r.text)
    .join("");
}

/** Total plain-text length of the runs. */
export function runsLength(runs: RichText): number {
  let n = 0;
  for (const r of runs) n += r.text.length;
  return n;
}

// ---------------------------------------------------------------------------
// Coalescing
// ---------------------------------------------------------------------------

/** Stable key for a run's attributes (marks/color/link) — equal iff mergeable. */
function attrKey(run: TextRun): string {
  const marks = run.marks && run.marks.length > 0 ? sortMarks(run.marks) : [];
  const color = run.color && run.color !== "default" ? run.color : "";
  const link = run.link ?? "";
  return JSON.stringify([marks, color, link]);
}

/**
 * Normalize a run: drop empty marks, drop `"default"`/absent color, ensure marks
 * are canonically sorted, and omit empty attribute keys entirely.
 */
function normalizeRun(run: TextRun): TextRun {
  const out: TextRun = { text: run.text };
  if (run.marks && run.marks.length > 0) out.marks = sortMarks(run.marks);
  if (run.color && run.color !== "default") out.color = run.color;
  if (run.link) out.link = run.link;
  return out;
}

/**
 * Drop empty-text runs and coalesce adjacent runs with identical marks (compared
 * sorted), color, and link into one. The single normalizer used by `mergeRuns`
 * and the runs↔Lexical converter.
 */
export function coalesce(runs: RichText): RichText {
  const out: RichText = [];
  for (const raw of runs) {
    if (raw.text.length === 0) continue;
    const run = normalizeRun(raw);
    const last = out[out.length - 1];
    if (last && attrKey(last) === attrKey(run)) {
      last.text += run.text;
    } else {
      out.push(run);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Split / merge
// ---------------------------------------------------------------------------

/**
 * Split runs at a plain-text character `offset`, preserving each run's
 * marks/color/link. A run straddling the offset is divided into two runs with the
 * same attributes. The offset is clamped to `[0, runsLength]`.
 */
export function splitRuns(runs: RichText, offset: number): [RichText, RichText] {
  const at = Math.max(0, Math.min(offset, runsLength(runs)));
  const before: RichText = [];
  const after: RichText = [];
  let consumed = 0;
  for (const run of runs) {
    const start = consumed;
    const end = consumed + run.text.length;
    if (end <= at) {
      before.push(normalizeRun(run));
    } else if (start >= at) {
      after.push(normalizeRun(run));
    } else {
      // Straddles the offset — divide into two runs with identical attributes.
      const cut = at - start;
      before.push(normalizeRun({ ...run, text: run.text.slice(0, cut) }));
      after.push(normalizeRun({ ...run, text: run.text.slice(cut) }));
    }
    consumed = end;
  }
  return [coalesce(before), coalesce(after)];
}

/** Concatenate two runs lists and coalesce the seam. */
export function mergeRuns(a: RichText, b: RichText): RichText {
  return coalesce([...a, ...b]);
}
