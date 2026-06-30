import { getConfig } from "@plugins/config_v2/server";
import { gmailConfig } from "../../shared/config";

/** Whether the Settings "Enable Gmail access" toggle is on. */
export function isGmailEnabled(): boolean {
  return getConfig(gmailConfig).enabled;
}
