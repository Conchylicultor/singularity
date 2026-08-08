/**
 * Install-time provisioning: the chromium binary the `e2e/` scripts launch.
 *
 * The implementation moved to `browser-fetch`'s `core` (`ensureChromium`) when a
 * *backend* gained a runtime need for the same binary. A backend's correctness
 * must not silently depend on a tooling plugin's install step, so the primitive
 * that needs chromium at runtime owns the provisioning and this harness calls
 * the same function. The runner is idempotent, so the second contribution is a
 * single `existsSync` in steady state.
 */
import { ensureChromium } from "@plugins/infra/plugins/safe-fetch/plugins/browser-fetch/core";

export default async function provision(): Promise<void> {
  await ensureChromium();
}
