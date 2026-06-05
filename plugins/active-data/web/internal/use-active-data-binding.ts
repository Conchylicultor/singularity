import { useCallback, useMemo } from "react";
import type { ZodType } from "zod";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { activeDataBindingsResource } from "@plugins/active-data/core";
import { useActiveDataIdentity } from "./identity-context";

interface ActiveDataBindingBase<T> {
  /** Whether identity is available (false in legacy logs without messageId). */
  enabled: boolean;
  /** Upsert the payload. No-op when `enabled` is false. */
  set: (next: T) => Promise<void>;
  /** Delete the binding. No-op when `enabled` is false. */
  clear: () => Promise<void>;
}

export type ActiveDataBindingHandle<T> =
  | (ActiveDataBindingBase<T> & { pending: true })
  | (ActiveDataBindingBase<T> & {
      pending: false;
      /** Persisted, schema-validated payload for this widget instance, or null. */
      value: T | null;
    });

function bindingPath(p: {
  conversationId: string;
  messageId: string;
  tag: string;
  occurrenceIndex: number;
}): string {
  return `/api/active-data/bindings/${encodeURIComponent(p.conversationId)}/${encodeURIComponent(p.messageId)}/${encodeURIComponent(p.tag)}/${p.occurrenceIndex}`;
}

export function useActiveDataBinding<T>(
  schema: ZodType<T>,
): ActiveDataBindingHandle<T> {
  const identity = useActiveDataIdentity();
  const resource = useResource(
    activeDataBindingsResource,
    identity ? { conversationId: identity.conversationId } : { conversationId: "" },
  );

  const value = useMemo<T | null>(() => {
    if (!identity || resource.pending) return null;
    const row = resource.data.find(
      (b) =>
        b.messageId === identity.messageId &&
        b.tag === identity.tag &&
        b.occurrenceIndex === identity.occurrenceIndex,
    );
    if (!row) return null;
    const parsed = schema.safeParse(row.payload);
    return parsed.success ? parsed.data : null;
  }, [identity, resource, schema]);

  const set = useCallback(
    async (next: T) => {
      if (!identity) return;
      const res = await fetch(bindingPath(identity), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: next }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `Save binding failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
      }
    },
    [identity],
  );

  const clear = useCallback(async () => {
    if (!identity) return;
    const res = await fetch(bindingPath(identity), { method: "DELETE" });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Clear binding failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }
  }, [identity]);

  if (!identity || resource.pending) return { pending: true, enabled: identity !== null, set, clear };
  return { pending: false, value, enabled: true, set, clear };
}
