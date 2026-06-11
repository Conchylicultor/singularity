import { useCallback, useMemo } from "react";
import type { ZodType } from "zod";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { activeDataBindingsResource, putBinding, deleteBinding } from "@plugins/active-data/core";
import { useActiveDataIdentity, type ActiveDataIdentity } from "./identity-context";

/**
 * Route params for the binding endpoints. The route templates `:occurrenceIndex`
 * as a string segment, so the numeric identity field is serialized here.
 */
function bindingParams(identity: ActiveDataIdentity) {
  return {
    conversationId: identity.conversationId,
    messageId: identity.messageId,
    tag: identity.tag,
    occurrenceIndex: String(identity.occurrenceIndex),
  };
}

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
      try {
        await fetchEndpoint(putBinding, bindingParams(identity), {
          body: { payload: next },
        });
      } catch (err) {
        if (err instanceof EndpointError) {
          const detail = typeof err.body === "string" ? err.body : "";
          throw new Error(
            `Save binding failed (${err.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
          );
        }
        throw err;
      }
    },
    [identity],
  );

  const clear = useCallback(async () => {
    if (!identity) return;
    try {
      await fetchEndpoint(deleteBinding, bindingParams(identity));
    } catch (err) {
      if (err instanceof EndpointError) {
        const detail = typeof err.body === "string" ? err.body : "";
        throw new Error(
          `Clear binding failed (${err.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
      }
      throw err;
    }
  }, [identity]);

  if (!identity || resource.pending) return { pending: true, enabled: identity !== null, set, clear };
  return { pending: false, value, enabled: true, set, clear };
}
