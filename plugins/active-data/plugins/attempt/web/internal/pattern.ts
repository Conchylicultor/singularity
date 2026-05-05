import { inlineBoundary } from "@plugins/active-data/shared";

export const ATTEMPT_ID_RE = inlineBoundary(/att-\d+-[a-z0-9]{4}/);
