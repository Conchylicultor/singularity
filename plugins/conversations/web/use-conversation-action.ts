import { useState } from "react";
import { ShellCommands as Shell } from "@plugins/shell/web";

export type ConversationActionOpts = {
  successMessage: string | ((data: unknown) => string);
  errorMessage: string;
};

export function useConversationAction(
  conversationId: string,
  endpoint: string,
  opts: ConversationActionOpts,
): { trigger: () => Promise<void>; busy: boolean } {
  const [busy, setBusy] = useState(false);

  async function trigger() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/${endpoint}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const description =
        typeof opts.successMessage === "function"
          ? opts.successMessage(await res.json())
          : opts.successMessage;
      Shell.Toast({ description, variant: "success" });
    } catch (err) {
      Shell.Toast({
        description: `${opts.errorMessage}: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return { trigger, busy };
}
