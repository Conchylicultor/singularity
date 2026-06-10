import { recordCrash } from "./record-crash";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { reportCrash } from "../../shared/endpoints";

// `body` is the validated CrashReportBody — its field list is single-sourced
// from CrashReportBodySchema and it is structurally a CrashReport (client
// sources ⊂ CrashSource), so every reported field flows through with no
// per-field hand-map (which previously silently dropped new fields like
// clientId/buildId). Invalid sources are rejected by the schema's z.enum at the
// validation layer (clean 400), so no manual source check is needed here.
export const handleReport = implement(reportCrash, async ({ body }) =>
  recordCrash(body),
);
