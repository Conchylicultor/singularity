/**
 * Install-time provisioning: the chromium binary the `e2e/` scripts launch.
 *
 * The implementation lives in `browser-fetch`'s `provision/`
 * (`provisionChromium`) — a *backend* has a runtime need for the same binary,
 * and a backend's correctness must not silently depend on a tooling plugin's
 * install step, so the primitive that needs chromium at runtime owns the
 * provisioning and this harness calls the same function. The step is
 * idempotent, so the second contribution is a single stamp read in steady
 * state. See that file for why the installer is install-time-only.
 */
import { provisionChromium } from "@plugins/infra/plugins/safe-fetch/plugins/browser-fetch/provision";

export default async function provision(): Promise<void> {
  await provisionChromium();
}
