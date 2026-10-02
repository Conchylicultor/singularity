/**
 * The only width dial in the vocabulary — a ROLE, never a measurement:
 *
 * - `menu` — a list of short choices;
 * - `described` — a list of choices that each carry a visible description line
 *   (its width decides how many lines each description wraps to);
 * - `builder` — a six-track rule row (filter, sort);
 * - `picker` — a panel whose body is a grid (swatches, icons, covers).
 *
 * Each maps to the popover width role of the same name (density tokens
 * `popoverWidth*`). A panel declares one, and so does every page pushed onto
 * its stack that needs another (`PanelStackEntry.size`).
 */
export type ControlPanelSize = "menu" | "described" | "builder" | "picker";
