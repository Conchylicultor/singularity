import type { ShadowTokenValues } from "./group";

export interface ShadowParams {
  color: string;
  opacity: number;
  blur: string;
  spread: string;
  offsetX: string;
  offsetY: string;
}

function subtractPx(value: string, amount: number): string {
  const num = parseFloat(value);
  return `${num - amount}px`;
}

export function buildShadowTiers(p: ShadowParams): ShadowTokenValues {
  const c = (mult: number) =>
    `oklch(${p.color} / ${(p.opacity * mult).toFixed(2)})`;
  const spread2 = subtractPx(p.spread, 1);

  return {
    "shadow-2xs": `${p.offsetX} ${p.offsetY} ${p.blur} ${p.spread} ${c(0.5)}`,
    "shadow-xs": `${p.offsetX} ${p.offsetY} ${p.blur} ${p.spread} ${c(0.5)}`,
    "shadow-sm": `${p.offsetX} ${p.offsetY} ${p.blur} ${p.spread} ${c(1.0)}, ${p.offsetX} 1px 2px ${spread2} ${c(1.0)}`,
    shadow: `${p.offsetX} ${p.offsetY} ${p.blur} ${p.spread} ${c(1.0)}, ${p.offsetX} 1px 2px ${spread2} ${c(1.0)}`,
    "shadow-md": `${p.offsetX} ${p.offsetY} ${p.blur} ${p.spread} ${c(1.0)}, ${p.offsetX} 2px 4px ${spread2} ${c(1.0)}`,
    "shadow-lg": `${p.offsetX} ${p.offsetY} ${p.blur} ${p.spread} ${c(1.0)}, ${p.offsetX} 4px 6px ${spread2} ${c(1.0)}`,
    "shadow-xl": `${p.offsetX} ${p.offsetY} ${p.blur} ${p.spread} ${c(1.0)}, ${p.offsetX} 8px 10px ${spread2} ${c(1.0)}`,
    "shadow-2xl": `${p.offsetX} ${p.offsetY} ${p.blur} ${p.spread} ${c(2.5)}`,
  };
}
