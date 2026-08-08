/**
 * Install-time provisioning: the chromium binary this plugin launches at
 * runtime. The implementation lives in `core/` (`ensureChromium`) so the e2e
 * harness's own provisioning contribution calls the SAME function — see the
 * rationale on it.
 */
import { ensureChromium } from "../core";

export default async function provision(): Promise<void> {
  await ensureChromium();
}
