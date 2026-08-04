import { runClaudePrint } from "@plugins/infra/plugins/claude-cli/server";
import type { ExtractedEvent } from "@plugins/apps/plugins/events/plugins/events-core/core";
import type { ProbeContext } from "@plugins/apps/plugins/events/plugins/events-core/server";
import type { UrlSourceConfig } from "../../core";
import { parseExtractionResponse } from "./parse-response";
import {
  buildExtractionPrompt,
  buildExtractionSystem,
  todayKey,
} from "./prompt";
import { readUrlSourceConfig } from "./source-config";
import type { UrlPagePayload } from "./probe";

/** Generous: a long listing page is a minute of Sonnet, and this is a background job. */
const EXTRACTION_TIMEOUT_MS = 120_000;

/**
 * The expensive phase — reached ONLY when the probe's fingerprint moved, which
 * the engine, not this file, guarantees.
 *
 * A one-shot `claude --print` rather than an agent session: deterministic, cheap
 * to retry, reuses the user's local Claude auth (no API key plumbing), and every
 * call is already durably logged to `claude_cli_calls` — so "did this page cost
 * a model call?" is answerable in Debug → Claude CLI calls, which is exactly the
 * assertion the probe/extract cache exists to make.
 */
export async function extractUrlEvents(
  payload: UrlPagePayload,
  ctx: ProbeContext<UrlSourceConfig>,
): Promise<ExtractedEvent[]> {
  const config = readUrlSourceConfig(ctx.config);

  const out = await runClaudePrint({
    tier: "sonnet",
    system: buildExtractionSystem(todayKey()),
    prompt: buildExtractionPrompt({
      url: payload.url,
      hint: config.hint,
      text: payload.text,
    }),
    timeoutMs: EXTRACTION_TIMEOUT_MS,
    source: {
      name: "events.url-extract",
      context: { sourceId: ctx.sourceId, url: payload.url },
    },
  });

  return parseExtractionResponse(out);
}
