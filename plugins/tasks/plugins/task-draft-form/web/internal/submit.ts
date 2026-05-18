import { flushSync } from "react-dom";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { extractAttachmentIds } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import type { CardDraft } from "../components/task-draft-form";
import type {
  TaskChainRelate,
  TaskChainSubmitBody,
  TaskChainSubmitResponse,
  TaskChainTarget,
} from "@plugins/tasks/core";

export interface SubmitArgs {
  cards: CardDraft[];
  target: TaskChainTarget;
  relate: TaskChainRelate | undefined;
  url: string;
  // Optional hook so the popover can close before screenshot capture.
  beforeScreenshot?: () => void;
}

export interface SubmitOutcome {
  ok: boolean;
  errorMessage?: string;
  taskIds?: string[];
  launchedCount: number;
  totalCount: number;
}

export async function submitChain(args: SubmitArgs): Promise<SubmitOutcome> {
  const trimmed = args.cards.map((c) => ({ ...c, text: c.text.trim() }));
  const totalCount = trimmed.length;
  const launchedCount = trimmed.filter((c) => c.model !== "queue").length;

  if (trimmed.some((c) => !c.text)) {
    return { ok: false, errorMessage: "All cards need text", launchedCount, totalCount };
  }

  // One screenshot per submission, shared across cards that requested it.
  const needsScreenshot = trimmed.some((c) => c.includeScreenshot);
  let screenshotAttachmentId: string | null = null;
  if (needsScreenshot) {
    if (args.beforeScreenshot) flushSync(() => args.beforeScreenshot!());
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    // Lazy-import modern-screenshot so plugins that don't enable the
    // screenshot capture don't pull it into their bundle.
    const { domToBlob } = await import("modern-screenshot");
    const blob = await domToBlob(document.documentElement, {
      scale: window.devicePixelRatio || 1,
    });
    if (!blob) {
      return { ok: false, errorMessage: "Screenshot failed", launchedCount, totalCount };
    }
    const uploaded = await uploadAttachment(blob, "page.png", "image/png");
    screenshotAttachmentId = uploaded.id;
  }

  const body: TaskChainSubmitBody = {
    target: args.target,
    relate: args.relate,
    cards: trimmed.map((c, i) => {
      const idSet = new Set<string>();
      for (const id of extractAttachmentIds(c.text)) idSet.add(id);
      if (c.includeScreenshot && screenshotAttachmentId) {
        idSet.add(screenshotAttachmentId);
      }
      const attachmentIds = Array.from(idSet);
      return {
        text: c.text,
        launch: c.model === "queue" ? null : c.model,
        url: c.includeUrl ? args.url : undefined,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        includeParentTask: i === 0 && c.includeParentTask ? true : undefined,
        linkedToPrev: i > 0 && !c.linkedToPrev ? false : undefined,
      };
    }),
  };

  const res = await fetch("/api/tasks/chain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    return {
      ok: false,
      errorMessage: `Submit failed${msg ? `: ${msg}` : ""}`,
      launchedCount,
      totalCount,
    };
  }
  const json = (await res.json()) as TaskChainSubmitResponse;
  return { ok: true, taskIds: json.taskIds, launchedCount, totalCount };
}

export function describeOutcome(outcome: SubmitOutcome, cards: CardDraft[]): string {
  if (cards.length === 1) {
    const card = cards[0]!;
    if (card.model === "queue") return "Queued";
    return `Launched with ${card.model === "sonnet" ? "Sonnet" : "Opus"}`;
  }
  if (outcome.launchedCount === 0) return `Queued ${outcome.totalCount} tasks`;
  return `Chained ${outcome.totalCount} tasks (${outcome.launchedCount} armed)`;
}
