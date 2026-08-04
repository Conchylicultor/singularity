import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  ExtractedEventSchema,
  type ExtractedEvent,
} from "@plugins/apps/plugins/events/plugins/events-core/core";

// Model response → `ExtractedEvent[]`, or a loud terminal failure.
//
// Every failure here is deterministic — the same stored page re-sent produces
// the same unusable answer — so all of them are `NonRetryableError`, which the
// engine classifies onto the source row and dead-letters after ONE attempt
// instead of paying for three identical model calls. And every one of them
// carries an excerpt of the raw output, because "the extractor returned
// something unparseable" is undebuggable without seeing what it returned.
//
// Returning `[]` on a parse failure would be the actively harmful alternative:
// the engine reads `[]` as "the page genuinely lists nothing" and stamps
// `disappearedAt` on every event this source ever found.

/** Enough of the model's answer to see what went wrong, bounded for a DB column. */
const MAX_EXCERPT = 400;

function excerpt(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length > MAX_EXCERPT
    ? `${trimmed.slice(0, MAX_EXCERPT)}…`
    : trimmed;
}

/**
 * Carve the JSON array out of a response that may be wrapped in prose or a
 * ```json fence.
 *
 * A bracket scan rather than a regex, and string-aware: a `]` inside a title
 * ("Techno [Night]") must not end the array, and a `\"` inside that title must
 * not end the string. Anything before the first `[` and after its match is
 * discarded — the model being chatty is not a failure.
 */
function isolateJsonArray(raw: string): string {
  const start = raw.indexOf("[");
  if (start === -1) {
    throw new NonRetryableError(
      `Extraction response contained no JSON array: ${excerpt(raw)}`,
    );
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  throw new NonRetryableError(
    `Extraction response had an unterminated JSON array: ${excerpt(raw)}`,
  );
}

/**
 * Parse and validate a `runClaudePrint` response as the extractor's output.
 *
 * `[]` is a legitimate success — the page really lists no events.
 */
export function parseExtractionResponse(raw: string): ExtractedEvent[] {
  const json = isolateJsonArray(raw);

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    throw new NonRetryableError(
      `Extraction response was not valid JSON (${err.message}): ${excerpt(raw)}`,
      { cause: err },
    );
  }

  const parsed = ExtractedEventSchema.array().safeParse(value);
  if (!parsed.success) {
    // Wrapped rather than rethrown as the bare `ZodError`: the schema message
    // alone says which key was wrong but not what the model actually wrote, and
    // that excerpt is the whole debugging value of this failure.
    throw new NonRetryableError(
      `Extraction response did not match the event schema (${parsed.error.message}): ${excerpt(raw)}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}
