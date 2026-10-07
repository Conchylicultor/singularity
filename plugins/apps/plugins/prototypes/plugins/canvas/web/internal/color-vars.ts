/**
 * Paint a frame's color options into its loaded document: each one as
 * `--<name>: #rrggbb` on the document's `<html>` — the property the page's
 * own default sits in (`<html style="--accent: …">`) and the server stamps a
 * pick into. Setting it on the live document repaints the page without a
 * reload, which is what lets a drag show every move (see `useFrameColorVars`).
 *
 * Only a property that differs is written, so calling it on every render
 * costs a read per option.
 */
export function publishColorVars(
  doc: Document,
  vars: Readonly<Record<string, string>>,
): void {
  const style = doc.documentElement.style;
  for (const [name, hex] of Object.entries(vars)) {
    const prop = `--${name}`;
    if (style.getPropertyValue(prop) !== hex) style.setProperty(prop, hex);
  }
}
