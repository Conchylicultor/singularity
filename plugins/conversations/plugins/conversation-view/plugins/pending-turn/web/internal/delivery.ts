import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { postConversationTurn } from "@plugins/conversations/core";

// ---------------------------------------------------------------------------
// The delivery leg — the ONE thing that varies between the surfaces that send a
// turn. Everything else about a send (the durable record, the instant echo, the
// confirmation deadline, transcript reconciliation, retry, the
// `turn-unconfirmed` report) is identical no matter how the text reaches the
// agent, so the store owns all of it and knows nothing about which endpoint
// carried the request.
//
// A delivery is REGISTERED under a stable id rather than passed as a closure,
// because a record outlives the tab that created it: `failed-post` /
// `unconfirmed` records persist in localStorage, and their Retry button has to
// re-dispatch after a reload, when the original thunk is long gone. The record
// therefore stores `{ deliveryId, payload }` — both serializable — and the
// retry path looks the delivery back up here.
//
// Consequence for contributors: the module holding your `defineTurnDelivery`
// call must be reachable from your plugin's web barrel (re-export it), so the
// registration happens at plugin load rather than when your component first
// mounts. A record whose delivery is missing at retry time fails loudly into
// `failed-post` with `failureKind: "delivery"` — the text is still recoverable
// via Copy to draft — but that is a degraded outcome, not the design.
// ---------------------------------------------------------------------------

/**
 * What a delivery reports back: the text the transcript will actually carry,
 * when the server rewrote it (e.g. `postConversationTurn` resolves attachment
 * refs into `@<disk-path>`). `null` means "the echoed text is what to match" —
 * the record falls back to its own `text`.
 */
export interface TurnDeliveryResult {
  resolvedText: string | null;
}

export interface TurnDelivery<P> {
  /** Stable id persisted on the record; the retry path re-dispatches through it. */
  id: string;
  /**
   * Deliver the turn. MUST reject on failure — a resolved promise is taken as
   * "the request was accepted", which arms the confirmation deadline. The
   * signal carries the store's send timeout.
   */
  send(
    conversationId: string,
    payload: P,
    signal: AbortSignal,
  ): Promise<TurnDeliveryResult>;
}

/**
 * Payload types are erased at the registry boundary (one map, many payload
 * shapes). The pairing that matters — a record's `payload` matching the
 * `deliveryId` it was stored with — is guaranteed at the `sendConversationTurn`
 * call site, where `TurnSend<P>` ties them together; nothing else ever mints a
 * record.
 */
type ErasedDelivery = TurnDelivery<unknown>;

const registry = new Map<string, ErasedDelivery>();

export function defineTurnDelivery<P>(delivery: TurnDelivery<P>): TurnDelivery<P> {
  const erased = delivery as unknown as ErasedDelivery;
  const existing = registry.get(delivery.id);
  // Idempotent under a re-evaluated module (HMR); a genuine id collision between
  // two different deliveries is a bug and must not silently shadow.
  if (existing && existing !== erased) {
    throw new Error(`Turn delivery "${delivery.id}" is already registered`);
  }
  registry.set(delivery.id, erased);
  return delivery;
}

export class UnknownTurnDeliveryError extends Error {
  constructor(id: string) {
    super(
      `No turn delivery registered for "${id}" — the plugin that owns it must ` +
        `re-export its defineTurnDelivery module from its web barrel so the ` +
        `registration survives a reload.`,
    );
    this.name = "UnknownTurnDeliveryError";
  }
}

export function getTurnDelivery(id: string): ErasedDelivery {
  const delivery = registry.get(id);
  if (!delivery) throw new UnknownTurnDeliveryError(id);
  return delivery;
}

export const POST_TURN_DELIVERY_ID = "post-turn";

/**
 * The default delivery: a plain user turn over `POST /api/conversations/:id/turn`.
 * This module is the ONE sanctioned caller of `postConversationTurn` from web
 * code (enforced by `turn-send-safety/no-adhoc-turn-send`).
 */
export const postTurnDelivery = defineTurnDelivery<{ text: string }>({
  id: POST_TURN_DELIVERY_ID,
  async send(conversationId, payload, signal) {
    const res = await fetchEndpoint(
      postConversationTurn,
      { id: conversationId },
      { body: { text: payload.text }, signal },
    );
    return { resolvedText: res.resolvedText };
  },
});
