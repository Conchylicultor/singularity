import { flushSync } from "react-dom";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { fetchEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { extractAttachmentIds } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import type { CardDraft } from "../components/task-draft-form";
import {
  createTaskChain,
  type TaskChainRelate,
  type TaskChainSubmitBody,
  type TaskChainTarget,
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
        prepromptId: c.prepromptId ?? undefined,
        url: c.includeUrl ? args.url : undefined,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        linkedToPrev: i > 0 && !c.linkedToPrev ? false : undefined,
      };
    }),
  };

  try {
    const json = await fetchEndpoint(createTaskChain, {}, { body });
    return { ok: true, taskIds: json.taskIds, launchedCount, totalCount };
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Submit failed: ${getEndpointErrorMessage(err)}`,
      launchedCount,
      totalCount,
    };
  }
}

/** First non-empty line of a card's text, trimmed to a notification-friendly length. */
function cardSummary(text: string): string {
  const firstLine = text.split("\n").find((l) => l.trim()) ?? "";
  const trimmed = firstLine.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
}

/**
 * Title + detail for the post-submit notification. The title states the action
 * ("Task created" / "Task queued"); the description names the specific task(s)
 * so the bell entry is self-explanatory rather than a bare verb.
 */
export function describeOutcome(
  outcome: SubmitOutcome,
  cards: CardDraft[],
): { title: string; description: string } {
  if (cards.length === 1) {
    const card = cards[0]!;
    const summary = cardSummary(card.text);
    if (card.model === "queue") {
      return { title: "Task queued", description: summary };
    }
    return { title: "Task created", description: `${summary} · ${card.model}` };
  }
  const summaries = cards.map((c) => cardSummary(c.text)).filter(Boolean).join(" → ");
  if (outcome.launchedCount === 0) {
    return { title: `${outcome.totalCount} tasks queued`, description: summaries };
  }
  return {
    title: `${outcome.totalCount} tasks created`,
    description: `${outcome.launchedCount} launched · ${summaries}`,
  };
}
