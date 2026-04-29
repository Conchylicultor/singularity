import { runClaudePrint } from "@plugins/infra/plugins/claude-cli/server";

const SYSTEM_PROMPT = `You generate concise titles for tasks.
Given a task description, output a single short imperative title (max ~60 characters).
Output the title text only — no quotes, no trailing period, no preamble, no commentary.`;

export function synthesiseTitleFallback(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? text;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

export async function generateTaskTitle(description: string): Promise<string> {
  const fallback = synthesiseTitleFallback(description);
  if (!description.trim()) return fallback;
  try {
    const out = await runClaudePrint({
      model: "haiku",
      prompt: description,
      system: SYSTEM_PROMPT,
      timeoutMs: 30_000,
    });
    const cleaned = out
      .trim()
      .split(/\r?\n/)[0]
      ?.trim()
      .replace(/^["']|["']$/g, "")
      .trim();
    if (!cleaned) return fallback;
    return cleaned.length > 80 ? `${cleaned.slice(0, 77)}…` : cleaned;
  } catch (err) {
    console.warn("[tasks-core] generateTaskTitle fell back:", err);
    return fallback;
  }
}
