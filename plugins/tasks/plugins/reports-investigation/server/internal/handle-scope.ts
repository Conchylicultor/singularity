import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  ReportKind,
  uninvestigatedReportCounts,
} from "@plugins/reports/server";
import { getReportScope } from "../../shared/endpoints";

export const handleGetReportScope = implement(
  getReportScope,
  async ({ query }) => {
    const counts = new Map(
      (await uninvestigatedReportCounts(query.minCount)).map((c) => [
        c.kind,
        c.reports,
      ]),
    );
    return {
      kinds: ReportKind.getContributions()
        .map((k) => ({
          kind: k.kind,
          variant: k.meta.variant,
          open: counts.get(k.kind) ?? 0,
        }))
        .sort((a, b) => a.kind.localeCompare(b.kind)),
    };
  },
);
