import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

/**
 * A report row that nobody has investigated yet was written: new, or an
 * existing fingerprint recurring. Emitted on the hot path after the row lands
 * (past the duress and fan-out gates — a collapsed storm never emits), so a
 * listener must be cheap. Noise reports and reports already linked to a task
 * do not emit. The Report investigations automation listens.
 */
export const reportRecordedSignal = defineReportSink<{ reportId: string }>();
