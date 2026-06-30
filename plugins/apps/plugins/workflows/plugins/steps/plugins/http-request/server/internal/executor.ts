import { defineStepExecutor } from "@plugins/apps/plugins/workflows/plugins/engine/server";
import { interpolate } from "@plugins/apps/plugins/workflows/plugins/steps/plugins/templating/core";
import { safeFetch } from "@plugins/infra/plugins/safe-fetch/server";

interface HttpRequestConfig {
  method?: string;
  url?: string;
  headers?: string;
  body?: string;
}

/**
 * Best-effort JSON decode for a response with a non-JSON content-type: a body
 * that happens to be JSON is decoded, anything else is returned as raw text. A
 * `SyntaxError` means "not JSON" (expected); any other error propagates loudly.
 */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) return text;
    throw err;
  }
}

/**
 * Parse a `Key: Value` per-line header block into a record. Blank lines and
 * lines without a colon are skipped; the split is on the FIRST colon so values
 * may themselves contain colons (e.g. a URL).
 */
function parseHeaders(raw: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) return headers;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) headers[key] = value;
  }
  return headers;
}

/**
 * Make an SSRF-safe outbound HTTP request and emit the response. Network,
 * timeout, and SsrfError failures propagate (fail loudly); a non-2xx status is
 * a valid routable result and is returned, not thrown.
 */
export const httpRequestExecutor = defineStepExecutor({
  pluginId: "http-request",
  async run({ step }) {
    const config = (step.config ?? {}) as HttpRequestConfig;
    const method = (config.method ?? "GET").toUpperCase();
    const url = interpolate(config.url ?? "", step.input);
    if (!url.trim()) {
      throw new Error("http-request step: url is required");
    }

    const headers = parseHeaders(config.headers);

    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD" && config.body) {
      body = interpolate(config.body, step.input);
    }

    const res = await safeFetch(url, {
      method,
      headers,
      body,
      timeoutMs: 30_000,
    });

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const text = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    let parsedBody: unknown = text;
    if (contentType.includes("application/json")) {
      parsedBody = JSON.parse(text);
    } else if (text) {
      parsedBody = tryParseJson(text);
    }

    return {
      output: {
        status: res.status,
        ok: res.ok,
        headers: responseHeaders,
        body: parsedBody,
      },
    };
  },
});
