import { ColorAdjustPicker } from "./color-adjust-picker";

const SEARCH_TERMS = ["color adjust", "hue", "saturation", "lightness"];

export function ColorAdjustSection({ search }: { search: string }) {
  if (search) {
    const q = search.toLowerCase();
    const matches = SEARCH_TERMS.some((term) => term.includes(q));
    if (!matches) return null;
  }

  return <ColorAdjustPicker />;
}
