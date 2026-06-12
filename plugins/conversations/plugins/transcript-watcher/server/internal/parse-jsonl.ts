import { XMLParser } from "fast-xml-parser";
import { extractPreprompt } from "../../core";
import type { JsonlEvent, TokenUsage, ToolCallResult } from "../../core";

type ToolCallEvent = Extract<JsonlEvent, { kind: "tool-call" }>;

const xmlParser = new XMLParser({ parseTagValue: false, trimValues: true });

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

const KNOWN_NOTIFICATION_KEYS = new Set(["task-id", "tool-use-id", "status", "summary", "output-file"]);

function extractTaskNotifications(text: string, at: string, out: JsonlEvent[]): string {
  const re = /<task-notification>([\s\S]*?)<\/task-notification>/g;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push(m[0]);

    let parsed: Record<string, unknown> = {};
    try {
      const result = xmlParser.parse(m[0]) as Record<string, unknown>;
      const inner = result["task-notification"];
      if (inner && typeof inner === "object") {
        parsed = inner as Record<string, unknown>;
      }
    } catch (err) {
      // fast-xml-parser throws generic Error instances on malformed XML;
      // re-throw anything that is not a standard Error (unexpected runtime throw)
      if (!(err instanceof Error)) throw err;
      continue;
    }

    const str = (v: unknown): string =>
      typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

    const taskId = str(parsed["task-id"]);
    const toolUseId = str(parsed["tool-use-id"]) || undefined;
    const status = str(parsed["status"]);
    const summary = str(parsed["summary"]);
    const outputFile = str(parsed["output-file"]) || undefined;

    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!KNOWN_NOTIFICATION_KEYS.has(k)) {
        const s = str(v);
        if (s) extra[k] = s;
      }
    }

    if (taskId || status || summary) {
      out.push({
        kind: "task-notification",
        at,
        taskId,
        toolUseId,
        status,
        summary,
        outputFile,
        extra: Object.keys(extra).length > 0 ? extra : undefined,
      });
    }
  }
  let stripped = text;
  for (const block of blocks) {
    stripped = stripped.replace(block, "");
  }
  return stripped.trim();
}

async function pushTextWithImages(text: string, at: string, out: JsonlEvent[]): Promise<void> {
  // Local regex instance — the g flag stores match state in lastIndex, so a
  // shared module-level regex gets corrupted when concurrent async calls
  // (from the file watcher) interleave at await points.
  // `[^\s@]` (not `\S`) excludes `@` from the path body so two concatenated
  // refs (`@path1.png@path2.png`, from legacy transcripts written before the
  // attachment rewrite added separators) parse as two tokens instead of the
  // greedy match fusing them into one non-existent path.
  const re = /@(\/[^\s@]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|tiff))/gi;

  const segments: Segment[] = [];
  let last = 0;
  let hasImages = false;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const before = text.slice(last, m.index);
    if (before) segments.push({ kind: "text", value: before });

    const path = m[1]!;
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
    } catch (err) {
      if (!(err instanceof Error) || !("code" in err)) throw err;
      // File system error (ENOENT, EACCES, etc.) — treat as missing image; render as text
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
  thinking?: string;
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; JSON array may contain null/undefined elements
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
  const assistantTextByMsgId = new Map<
    string,
    JsonlEvent & { kind: "assistant-text" }
  >();
  const usageAttributedMsgIds = new Set<string>();
  // tool-call pairing: toolUseId → emitted ToolCallEvent (result populated later)
  const toolCallByUseId = new Map<string, ToolCallEvent>();
  // Deferred tool results whose call hasn't appeared yet
  const pendingResults: { toolUseId: string; result: ToolCallResult }[] = [];
  // The launch preprompt is baked into the first user turn (wrapped in
  // <special_instructions>). Lift it out into a dedicated `preprompt` event so
  // it renders as a collapsed Instructions card, not as raw user text. Only
  // ever appears once; set true on a real hit so a later turn can't re-trigger.
  let seenPreprompt = false;

  for (const line of raw.split("\n")) {
    if (!line) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
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
      const isMeta = obj.isMeta === true;
      const sourceToolUseID =
        typeof obj.sourceToolUseID === "string" ? obj.sourceToolUseID : null;
      if (isMeta && sourceToolUseID) {
        const linked = toolCallByUseId.get(sourceToolUseID);
        if (linked) {
          const text = extractText(msg.content);
          if (text) {
            linked.injectedContext = [
              ...(linked.injectedContext ?? []),
              text,
            ];
          }
          continue;
        }
      }

      if (isMeta) {
        // Harness-injected prompt (loop/queue wakeup, resume, local-command
        // caveat) with no originating tool call. Surface it as its own kind so
        // it never renders as a human-authored user message.
        const text = extractText(msg.content);
        if (text) {
          events.push({
            kind: "meta-prompt",
            at: ts,
            source:
              typeof obj.promptSource === "string"
                ? obj.promptSource
                : undefined,
            text,
          });
        }
        continue;
      }

      const content = msg.content;
      if (typeof content === "string") {
        let body = content;
        if (!seenPreprompt) {
          const { preprompt, rest } = extractPreprompt(body);
          if (preprompt) {
            seenPreprompt = true;
            events.push({ kind: "preprompt", at: ts, text: preprompt });
            body = rest;
          }
        }
        const remaining = extractTaskNotifications(body, ts, events);
        if (remaining.length > 0) {
          await pushTextWithImages(remaining, ts, events);
        }
      } else if (Array.isArray(content)) {
        for (const block of content as RawBlock[]) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; JSON array may contain null/undefined elements
          if (block?.type === "tool_result") {
            const toolUseId =
              typeof block.tool_use_id === "string" ? block.tool_use_id : "";
            const result: ToolCallResult = {
              at: ts,
              content: extractText(block.content),
              isError: block.is_error === true ? true : undefined,
            };
            const existing = toolCallByUseId.get(toolUseId);
            if (existing) {
              existing.result = result;
            } else {
              pendingResults.push({ toolUseId, result });
            }
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; JSON array may contain null/undefined elements
          } else if (block?.type === "text" && typeof block.text === "string") {
            let body = block.text;
            if (!seenPreprompt) {
              const { preprompt, rest } = extractPreprompt(body);
              if (preprompt) {
                seenPreprompt = true;
                events.push({ kind: "preprompt", at: ts, text: preprompt });
                body = rest;
              }
            }
            const remaining = extractTaskNotifications(body, ts, events);
            if (remaining.length > 0) {
              await pushTextWithImages(remaining, ts, events);
            }
          } else if (
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; JSON array may contain null/undefined elements
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
      let usageAnchor: (JsonlEvent & ({ kind: "assistant-text" } | { kind: "tool-call" })) | null = null;
      const setUsageOnce = (
        event: JsonlEvent & ({ kind: "assistant-text" } | { kind: "tool-call" }),
      ) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; values may change by the time setUsageOnce is called
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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; JSON array may contain null/undefined elements
        if (block?.type === "thinking" && typeof block.thinking === "string") {
          events.push({
            kind: "assistant-thinking",
            at: ts,
            messageId: msgId,
            thinking: block.thinking,
          });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; JSON array may contain null/undefined elements
        } else if (block?.type === "text" && typeof block.text === "string") {
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
            stopReason: msg.stop_reason ?? undefined,
          };
          if (msgId) assistantTextByMsgId.set(msgId, event);
          setUsageOnce(event);
          events.push(event);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; JSON array may contain null/undefined elements
        } else if (block?.type === "tool_use") {
          const toolUseId = typeof block.id === "string" ? block.id : "";
          const event: ToolCallEvent = {
            kind: "tool-call",
            at: ts,
            messageId: msgId,
            toolUseId,
            name: typeof block.name === "string" ? block.name : "",
            input: block.input,
          };
          setUsageOnce(event);
          events.push(event);
          toolCallByUseId.set(toolUseId, event);
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

    if (type === "attachment") {
      const att = obj.attachment;
      if (att && typeof att === "object") {
        const subtype =
          typeof (att as Record<string, unknown>).type === "string"
            ? ((att as Record<string, unknown>).type as string)
            : "unknown";
        events.push({ kind: "attachment", at: ts, subtype, attachment: att });
      }
      continue;
    }

    if (type === "queue-operation") {
      const operation =
        typeof obj.operation === "string" ? (obj.operation as string) : "";
      const content =
        typeof obj.content === "string" ? (obj.content as string) : undefined;
      if (!operation) continue;
      // A background-task completion is enqueued (and later dequeued) as a raw
      // <task-notification> block, then delivered again in the agent's next
      // user turn — three transcript lines for one event. Parse the block into
      // a structured task-notification here; the dedup pass below collapses all
      // copies into a single row. Plain queued prompts (no notification block)
      // keep their lightweight queue-op line ("Queued" / "Sent to agent").
      if (content && content.includes("<task-notification>")) {
        extractTaskNotifications(content, ts, events);
        continue;
      }
      events.push({ kind: "queue-operation", at: ts, operation, content });
      continue;
    }

    events.push({
      kind: "unknown",
      at: ts,
      type: typeof type === "string" ? type : "unknown",
      raw: obj,
    });
  }

  // Second pass: resolve deferred results that arrived before their call
  // (shouldn't happen in normal flow, but handle gracefully)
  for (const { toolUseId, result } of pendingResults) {
    const call = toolCallByUseId.get(toolUseId);
    if (call) {
      call.result = result;
    } else {
      // Orphan result — no matching call; emit as a tool-call with empty name
      events.push({
        kind: "tool-call",
        at: result.at,
        toolUseId,
        name: "",
        input: null,
        result,
      });
    }
  }

  // Background-task completions surface up to three times in the raw transcript
  // (queue enqueue at completion, dequeue when sent, delivered copy in the next
  // user turn) — all parse to the same task-notification. Collapse to one row,
  // keeping the earliest (completion time). Keyed by tool-use id when present,
  // else by the notification's identifying fields.
  const seenNotifications = new Set<string>();
  const deduped: JsonlEvent[] = [];
  for (const ev of events) {
    if (ev.kind === "task-notification") {
      const key =
        ev.toolUseId ??
        `${ev.taskId}|${ev.status}|${ev.summary}|${ev.outputFile ?? ""}`;
      if (seenNotifications.has(key)) continue;
      seenNotifications.add(key);
    }
    deduped.push(ev);
  }

  return deduped;
}
