import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";
import type { UnionRun } from "@plugins/runs/core";

/**
 * The sections of one backup run's detail pane.
 *
 * Keyed by the **run**, not by its id. `BuildDetail<{ runId }>` passes an id
 * because each of its sections has to re-read a collection to find its row;
 * here the pane resolves the row once through `useRun`, so "not known yet" is
 * handled in exactly one place and no section can paint an empty-looking body
 * while the read is still in flight.
 */
export const BackupRunDetail = defineDetailSections<{ run: UnionRun }>();
