import { flushSync } from "react-dom";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { fetchEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { extractAttachmentIds } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import type { CardDraft } from "../components/task-draft-form";
import {
  launchOptionValue,
  pickKnownOptions,
  type LaunchOptionInfo,
} from "@plugins/tasks/plugins/launch-options/web";
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
  /**
   * The live launch-option registry. Passed in rather than read here: reading
   * it is a hook, so it belongs in the submitting component and this stays a
   * pure function of an explicit list.
   */
  options: readonly LaunchOptionInfo[];
  // Optional hook so the popover can close before screenshot capture.
  beforeScreenshot?: () => void;
}

export interface SubmitOutcome {
  ok: boolean;
  errorMessage?: string;
  taskIds?: string[];
  totalCount: number;
}

export async function submitChain(args: SubmitArgs): Promise<SubmitOutcome> {
  const trimmed = args.cards.map((c) => ({ ...c, text: c.text.trim() }));
  const totalCount = trimmed.length;

  if (trimmed.some((c) => !c.text)) {
    return { ok: false, errorMessage: "All cards need text", totalCount };
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
      return { ok: false, errorMessage: "Screenshot failed", totalCount };
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
        // Values whose option is no longer registered are dropped rather than
        // sent: a stale localStorage draft must not 400 the whole submit.
        options: pickKnownOptions(c.options, args.options),
        url: c.includeUrl ? args.url : undefined,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        linkedToPrev: i > 0 && !c.linkedToPrev ? false : undefined,
      };
    }),
  };

  try {
    const json = await fetchEndpoint(createTaskChain, {}, { body });
    return { ok: true, taskIds: json.taskIds, totalCount };
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Submit failed: ${getEndpointErrorMessage(err)}`,
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

/** A card's launch configuration, as the options themselves describe it. */
function optionSummaries(
  card: CardDraft,
  options: readonly LaunchOptionInfo[],
): string[] {
  return options.flatMap((o) => {
    const summary = o.summarize?.(launchOptionValue(card.options, o));
    return summary ? [summary] : [];
  });
}

/**
 * Title + detail for the post-submit notification. The title states the action;
 * the description names the specific task(s) — plus whatever the launch options
 * say about themselves — so the bell entry is self-explanatory rather than a
 * bare verb. The host reads no option by name: it once branched on the
 * auto-start value to say "queued" vs "created", which put one option's
 * vocabulary into generic chrome.
 */
export function describeOutcome(
  outcome: SubmitOutcome,
  cards: CardDraft[],
  options: readonly LaunchOptionInfo[],
): { title: string; description: string } {
  if (cards.length === 1) {
    const card = cards[0]!;
    const parts = [cardSummary(card.text), ...optionSummaries(card, options)];
    return { title: "Task created", description: parts.filter(Boolean).join(" · ") };
  }
  const summaries = cards.map((c) => cardSummary(c.text)).filter(Boolean).join(" → ");
  return {
    title: `${outcome.totalCount} tasks created`,
    description: summaries,
  };
}
