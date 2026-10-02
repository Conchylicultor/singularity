// Types for `seti-file.js` — see there for why it is JS.
import type { IconifyJSON } from "@iconify/types";

/** The vendored Seti Iconify JSON, parsed on first call. */
export declare function loadSetiJson(): Promise<IconifyJSON>;
