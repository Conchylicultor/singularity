/**
 * Reaching an adaptive-bar occupant from an e2e script the way a person does,
 * whatever the viewport width.
 *
 * A bar that runs out of room relocates occupants into its overflow panel. The
 * panel stays mounted while closed (`display: none` + `inert` + `aria-hidden`),
 * so a relocated control is still in the DOM — a CSS locator finds it and its
 * text reads fine — but it cannot be clicked, and a role locator does not find
 * it at all. Pinning a wide viewport only moves the width at which a script
 * breaks; opening the `⋯` the way a person would does not depend on it.
 */
import type { Locator, Page } from "playwright";

/** Every shown `⋯` trigger (a hidden one has nothing relocated behind it). */
const TRIGGERS =
  '[data-adaptive-bar-trigger]:not([hidden]) button[aria-haspopup="dialog"]';

/**
 * Run `act` on `control` once a person could reach it: at once when it sits in
 * its bar's row (or anywhere else on screen), else after opening the overflow
 * panel it was relocated into — which is closed again afterwards.
 *
 * The control must already be rendered: this does not wait for one that is
 * still loading (a closed panel's occupant is invisible to a role locator, so
 * there is no wait that means the same for every locator). Wait for the
 * surface to settle first.
 *
 * The panel is portaled, so nothing in the DOM ties a relocated occupant to its
 * bar's trigger: each shown `⋯` is tried in turn, as a person would, and a
 * panel that turns out not to hold the control is closed again. Throws when no
 * panel holds it (e.g. a bar with `overflow="clip"` parked it out of reach).
 */
export async function reachInBar<T>(
  page: Page,
  control: Locator,
  act: (control: Locator) => Promise<T>,
): Promise<T> {
  if (await control.first().isVisible()) return act(control);

  const triggers = page.locator(TRIGGERS);
  const count = await triggers.count();
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i);
    if (!(await trigger.isVisible())) continue;
    await trigger.click();
    if (await control.first().isVisible()) {
      const result = await act(control);
      await closeOpenPanels(page);
      return result;
    }
    await closeOpenPanels(page);
  }
  throw new Error(
    `reachInBar: ${control.toString()} is neither on screen nor in any shown overflow panel`,
  );
}

/**
 * Close every overflow panel that is open, through its own `⋯` (the trigger
 * toggles). Skips a trigger `act` already took away (a navigation unmounting
 * its bar), since a detached or hidden trigger has no open panel to close.
 */
async function closeOpenPanels(page: Page): Promise<void> {
  const open = page.locator(`${TRIGGERS}[aria-expanded="true"]`);
  const count = await open.count();
  for (let i = count - 1; i >= 0; i--) {
    const trigger = open.nth(i);
    if (await trigger.isVisible()) await trigger.click();
  }
}
