/** A `react-icons` module specifier (`react-icons`, `react-icons/md`, …). */
export function isReactIcons(source: unknown): boolean {
  return (
    typeof source === "string" &&
    (source === "react-icons" || source.startsWith("react-icons/"))
  );
}

/**
 * `primitives/icon-picker` is react-icons' one remaining user: it stores picked
 * icons as `SvgNode`s extracted from react-icons/md, and its generator builds
 * that map. Everything else draws Material Symbols through `ui/icons`.
 */
export function isIconPicker(filename: string): boolean {
  return filename.includes("/plugins/primitives/plugins/icon-picker/");
}
