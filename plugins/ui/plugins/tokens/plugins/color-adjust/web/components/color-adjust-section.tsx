import { ColorAdjustPicker } from "./color-adjust-picker";

const SEARCH_TERMS = ["color adjust", "hue", "saturation", "lightness"];

/**
 * Whether this section answers the customizer's search box. Declared as the
 * contribution's `useAvailable` rather than a `return null` in the body: the
 * host paints the card before it reaches the body, so a null there would leave
 * a "Color Adjust" bar over nothing on every non-matching query.
 */
export function useColorAdjustMatchesSearch({ search }: { search: string }): boolean {
  const q = search.trim().toLowerCase();
  return q.length === 0 || SEARCH_TERMS.some((term) => term.includes(q));
}

export function ColorAdjustSection() {
  return <ColorAdjustPicker />;
}
