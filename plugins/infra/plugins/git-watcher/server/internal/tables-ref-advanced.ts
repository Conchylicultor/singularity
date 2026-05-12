import { text } from "drizzle-orm/pg-core";
import { defineTriggerEvent } from "@plugins/infra/plugins/events/server";
import type { RefAdvancedPayload } from "../../shared/types";

export const { event: refAdvanced, table: _refAdvancedTriggers } =
  defineTriggerEvent<RefAdvancedPayload>({
    name: "git.refAdvanced",
    filters: {
      refName: text("ref_name"),
    },
  });
