/**
 * The Compare stage's DOM contract for a driver OUTSIDE the app.
 *
 * The stage renders two boxes at one shared width — the prototype mock and the
 * real thing it declares it mocks — and a script that wants to put a picture
 * of one against a picture of the other has to find those two boxes without
 * knowing which kind of counterpart is in the second one. It cannot import the
 * stage (e2e drives the deployed app, it does not import the code under test),
 * and it must not re-derive the counterpart itself (the kinds are an open
 * registry; a script that spelled `route:` and `fixture:` would be the
 * collection/consumer leak the architecture bans). So the stage PUBLISHES the
 * two boxes as data attributes, and this module is the one spelling of them —
 * read by the stage that sets them and by the driver that queries them.
 *
 * `core/`, so both the web plugin and an `e2e/` script can import it (an e2e
 * script may reach a plugin's `core` and `e2e` barrels only).
 */

/** Which of the two boxes an element is. */
export type CompareHalf = "mock" | "counterpart";

/** Attribute naming the half: `data-compare-half="mock" | "counterpart"`. */
export const COMPARE_HALF_ATTR = "data-compare-half";

/**
 * Attribute on the COUNTERPART half carrying the resolution's status —
 * `loading`, `unresolved` or `found`. A driver waits for `found` rather than
 * photographing a spinner or a "no such fixture" sentence; on `unresolved` the
 * half's own text is the reason, so the driver can print it.
 */
export const COMPARE_STATUS_ATTR = "data-compare-status";

/** The counterpart's resolution status as the stage publishes it. */
export type CompareStatus = "loading" | "unresolved" | "found";

/** CSS selector for one half, optionally at one status. */
export function compareHalfSelector(
  half: CompareHalf,
  status?: CompareStatus,
): string {
  const base = `[${COMPARE_HALF_ATTR}="${half}"]`;
  return status === undefined
    ? base
    : `${base}[${COMPARE_STATUS_ATTR}="${status}"]`;
}
