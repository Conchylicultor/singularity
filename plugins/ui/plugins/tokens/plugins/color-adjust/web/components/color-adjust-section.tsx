import { ColorAdjustPicker } from "./color-adjust-picker";

const SEARCH_TERMS = ["color adjust", "hue", "saturation", "lightness"];

export function ColorAdjustSection({ search }: { search: string }) {
  if (search) {
    const q = search.toLowerCase();
    const matches = SEARCH_TERMS.some((term) => term.includes(q));
    if (!matches) return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Color Adjust</h3>
      </div>
      <ColorAdjustPicker />
    </div>
  );
}
