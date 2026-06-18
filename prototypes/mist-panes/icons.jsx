/* Icon helper — Lucide line icons (soft, friendly).
   Renders a placeholder <i> that lucide.createIcons() swaps for an <svg>.
   Exposes window.Ic. */
function Ic({ name, size, color, className }) {
  const style = {};
  if (size) style.fontSize = typeof size === "number" ? size + "px" : size;
  if (color) style.color = color;
  return <i data-lucide={name} style={style} className={"lic " + (className || "")} />;
}

window.Ic = Ic;
