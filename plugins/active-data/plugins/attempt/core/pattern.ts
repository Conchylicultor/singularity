import { inlineBoundary } from "@plugins/active-data/core";

export const ATTEMPT_ID_RE = inlineBoundary(/att-\d+-[a-z0-9]{4}/);
