import { inlineBoundary } from "@plugins/active-data/shared";

export const TASK_ID_RE = inlineBoundary(/task-\d+-[a-z0-9]{4,8}/);
