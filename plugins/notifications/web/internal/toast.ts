import { ShellCommands } from "@plugins/shell/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { createNotification } from "../../shared/endpoints";
import type { NotificationVariant } from "../../shared/schema";

export interface ToastArgs {
  type: string;
  /** Headline: states *what happened* (e.g. "Task created"). Always required. */
  title: string;
  /** Detail: the specific instance (e.g. "Fix login bug · sonnet"). Always required. */
  description: string;
  variant?: NotificationVariant;
  linkTo?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

export const recentClientIds = new Set<string>();

export function toast(args: ToastArgs): void {
  const variant = args.variant ?? "info";

  ShellCommands.Toast({
    title: args.title,
    description: args.description,
    variant,
  });

  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  recentClientIds.add(id);
  setTimeout(() => recentClientIds.delete(id), 30_000);

  void fetchEndpoint(createNotification, {}, {
    body: {
      id,
      type: args.type,
      title: args.title,
      description: args.description,
      variant,
      linkTo: args.linkTo ?? null,
      metadata: args.metadata ?? null,
      dedupeKey: args.dedupeKey ?? null,
    },
  });
}
