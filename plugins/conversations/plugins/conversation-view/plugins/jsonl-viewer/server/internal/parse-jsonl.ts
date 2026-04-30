import type { JsonlEvent, TokenUsage } from "../../shared";

// Matches `@/absolute/path.ext` patterns for common image formats.
const AT_IMAGE_RE = /@(\/\S+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|tiff))/gi;

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tiff: "image/tiff",
};

type Segment = { kind: "text"; value: string } | { kind: "image"; mime: string; data: string };

async function pushTextWithImages(text: string, at: string, out: JsonlEvent[]): Promise<void> {
  AT_IMAGE_RE.lastIndex = 0;

  const segments: Segment[] = [];
  let last = 0;
  let hasImages = false;
  let m: RegExpExecArray | null;

  while ((m = AT_IMAGE_RE.exec(text)) !== null) {
    const before = text.slice(last, m.index);
    if (before) segments.push({ kind: "text", value: before });

    const path = m[1];
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    try {
      const f = Bun.file(path);
      if (await f.exists()) {
        const data = Buffer.from(await f.arrayBuffer()).toString("base64");
        segments.push({ kind: "image", mime: IMAGE_MIME[ext] ?? "image/png", data });
        hasImages = true;
      } else {
        segments.push({ kind: "text", value: m[0] });
      }
    } catch {
      segments.push({ kind: "text", value: m[0] });
    }

    last = m.index + m[0].length;
  }

  const after = text.slice(last);
  if (after) segments.push({ kind: "text", value: after });

  if (segments.length === 0) return;

  if (!hasImages) {
    if (text.trim()) out.push({ kind: "user-text", at, text });
    return;
  }

  const plainText = segments
    .filter((s): s is { kind: "text"; value: string } => s.kind === "text")
    .map((s) => s.value)
    .join("");

  out.push({ kind: "user-text", at, text: plainText, segments });
}

interface RawBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
  source?: {
    type?: string;
    media_type?: string;
    data?: string;
  };
}

function extractUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const usage: TokenUsage = {
    input: num(u.input_tokens),
    output: num(u.output_tokens),
    cacheRead: num(u.cache_read_input_tokens),
    cacheCreation: num(u.cache_creation_input_tokens),
  };
  if (
    usage.input === 0 &&
    usage.output === 0 &&
    usage.cacheRead === 0 &&
    usage.cacheCreation === 0
  ) {
    return undefined;
  }
  return usage;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content as RawBlock[]) {
    if (block?.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

export async function readJsonlEvents(path: string): Promise<JsonlEvent[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) return [];
  const raw = await file.text();

  const events: JsonlEvent[] = [];
  // Matches the turn-merging logic in readTurns(): assistant events sharing a
  // message.id are streaming chunks of one logical turn and should collapse.
  const assistantTextByMsgId = new Map<
    string,
    JsonlEvent & { kind: "assistant-text" }
  >();
  // Same message.id can appear across multiple JSONL lines (streaming or
  // resumes) with the same usage repeated. Track which msgIds have already
  // been credited so totals don't double-count.
  const usageAttributedMsgIds = new Set<string>();

  for (const line of raw.split("\n")) {
    if (!line) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = typeof obj.timestamp === "string" ? obj.timestamp : null;
    if (!ts) continue;

    const type = obj.type;
    const msg = obj.message as
      | {
          role?: string;
          content?: unknown;
          id?: string;
          stop_reason?: string;
        }
      | undefined;

    if (type === "user" && msg?.role === "user") {
      const content = msg.content;
      if (typeof content === "string") {
        if (content.length > 0) {
          await pushTextWithImages(content, ts, events);
        }
      } else if (Array.isArray(content)) {
        for (const block of content as RawBlock[]) {
          if (block?.type === "tool_result") {
            events.push({
              kind: "user-tool-result",
              at: ts,
              toolUseId:
                typeof block.tool_use_id === "string" ? block.tool_use_id : "",
              content: extractText(block.content),
              isError: block.is_error === true ? true : undefined,
            });
          } else if (block?.type === "text" && typeof block.text === "string") {
            await pushTextWithImages(block.text, ts, events);
          } else if (
            block?.type === "image" &&
            block.source?.type === "base64" &&
            typeof block.source.data === "string"
          ) {
            events.push({
              kind: "user-image",
              at: ts,
              mime:
                typeof block.source.media_type === "string"
                  ? block.source.media_type
                  : "image/jpeg",
              data: block.source.data,
            });
          }
        }
      }
      continue;
    }

    if (type === "assistant" && msg?.role === "assistant") {
      if (!Array.isArray(msg.content)) continue;
      const msgId = msg.id;
      const lineUsage = extractUsage((msg as { usage?: unknown }).usage);
      const shouldAttributeUsage =
        !!lineUsage && !!msgId && !usageAttributedMsgIds.has(msgId);
      // Anchor usage on the first assistant event we emit for this message,
      // so totals don't double-count when one message spans text + tool_use,
      // streamed chunks, or repeats across resume lines.
      let usageAnchor: (JsonlEvent & ({ kind: "assistant-text" } | { kind: "assistant-tool-use" })) | null = null;
      const setUsageOnce = (
        event: JsonlEvent & ({ kind: "assistant-text" } | { kind: "assistant-tool-use" }),
      ) => {
        if (!shouldAttributeUsage || !lineUsage || !msgId) return;
        if (usageAnchor) {
          if (usageAnchor === event) event.usage = lineUsage;
          return;
        }
        usageAnchor = event;
        event.usage = lineUsage;
        usageAttributedMsgIds.add(msgId);
      };
      for (const block of msg.content as RawBlock[]) {
        if (block?.type === "text" && typeof block.text === "string") {
          if (msgId) {
            const existing = assistantTextByMsgId.get(msgId);
            if (existing) {
              existing.text += block.text;
              if (msg.stop_reason) existing.stopReason = msg.stop_reason;
              setUsageOnce(existing);
              continue;
            }
          }
          const event: JsonlEvent & { kind: "assistant-text" } = {
            kind: "assistant-text",
            at: ts,
            messageId: msgId,
            text: block.text,
            stopReason: msg.stop_reason,
          };
          if (msgId) assistantTextByMsgId.set(msgId, event);
          setUsageOnce(event);
          events.push(event);
        } else if (block?.type === "tool_use") {
          const event: JsonlEvent & { kind: "assistant-tool-use" } = {
            kind: "assistant-tool-use",
            at: ts,
            messageId: msgId,
            toolUseId: typeof block.id === "string" ? block.id : "",
            name: typeof block.name === "string" ? block.name : "",
            input: block.input,
          };
          setUsageOnce(event);
          events.push(event);
        }
      }
      if (msgId && msg.stop_reason) {
        const existing = assistantTextByMsgId.get(msgId);
        if (existing && !existing.stopReason) {
          existing.stopReason = msg.stop_reason;
        }
      }
      continue;
    }

    if (type === "system") {
      const subtype =
        typeof obj.subtype === "string" ? (obj.subtype as string) : undefined;
      const text =
        typeof obj.content === "string"
          ? (obj.content as string)
          : typeof (obj as { text?: unknown }).text === "string"
            ? ((obj as { text: string }).text)
            : extractText((obj as { message?: unknown }).message);
      if (text) events.push({ kind: "system", at: ts, subtype, text });
      continue;
    }

    if (type === "summary") {
      const text =
        typeof (obj as { summary?: unknown }).summary === "string"
          ? ((obj as { summary: string }).summary)
          : "";
      if (text) events.push({ kind: "summary", at: ts, text });
      continue;
    }
  }

  return events;
}
