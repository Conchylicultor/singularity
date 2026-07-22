import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ReportKind } from "@plugins/reports/server";
import {
  TurnUnconfirmedPayloadSchema,
  turnUnconfirmedFingerprint,
} from "../core";
import {
  renderTurnUnconfirmedTask,
  TURN_UNCONFIRMED_NOTIF_COOLDOWN_MS,
} from "./internal/turn-unconfirmed-task";

export default {
  description:
    "Turn-unconfirmed report kind: validates unconfirmed-turn payloads (a sent turn POSTed and acked but never confirmed in the transcript within the confirmation window), fingerprints by conversation id (repeats on one conversation collapse onto one row), and renders an investigation task. Re-arms periodically (6h) since a conversation that keeps dropping turns is a recurring warning, not a one-shot crash.",
  contributions: [
    ReportKind({
      kind: "turn-unconfirmed",
      schema: TurnUnconfirmedPayloadSchema,
      fingerprint: turnUnconfirmedFingerprint,
      meta: {
        tag: "[turn-unconfirmed]",
        notif: "Turn not confirmed in transcript",
        variant: "warning",
        notifCooldownMs: TURN_UNCONFIRMED_NOTIF_COOLDOWN_MS,
      },
      renderTask: renderTurnUnconfirmedTask,
    }),
  ],
} satisfies ServerPluginDefinition;
