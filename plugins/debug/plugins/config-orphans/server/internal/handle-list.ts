import { implement } from "@plugins/infra/plugins/endpoints/server";
import { auditUserConfigOrphans } from "@plugins/config_v2/server";
import { configOrphans } from "../../shared/endpoints";

// Pure presentation seam: config_v2 owns the config-dir layout and the audit
// logic. We just surface its report. `auditUserConfigOrphans()` defaults to the
// real CONFIG_DIR + live registry — always the current worktree's own config.
export const handleList = implement(configOrphans, () => auditUserConfigOrphans());
