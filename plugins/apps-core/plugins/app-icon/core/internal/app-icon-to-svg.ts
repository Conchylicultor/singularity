import { svgNodesToString } from "@plugins/primitives/plugins/icon-picker/core";
import type { AppIcon } from "../index";

export interface AppIconSvgOptions {
  /** Canvas size in px (square). Default 512. */
  size?: number;
  /** CSS color for the rounded-rect background, or null for transparent. Default "#18181b". */
  background?: string | null;
  /** Rounded-rect corner radius in px. Default Math.round(size * 0.22). */
  cornerRadius?: number;
  /** Glyph fill color (resvg has no currentColor). Default "#ffffff". */
  foreground?: string;
  /** Glyph margin as a fraction of size. Default 0.18. */
  padding?: number;
}

/**
 * Rasterizable SVG markup for an {@link AppIcon}. Runtime-agnostic, pure, and
 * synchronous — the release CLI feeds this to resvg to mint favicon / Tauri
 * window icons without a browser. The `<g fill>` replaces the web's
 * `currentColor` inheritance, since the rasterizer has no ambient color.
 */
export function appIconToSvg(icon: AppIcon, opts: AppIconSvgOptions = {}): string {
  const size = opts.size ?? 512;
  const background = opts.background === undefined ? "#18181b" : opts.background;
  const cornerRadius = opts.cornerRadius ?? Math.round(size * 0.22);
  const foreground = opts.foreground ?? "#ffffff";
  const padding = opts.padding ?? 0.18;

  switch (icon.kind) {
    case "md": {
      const inner = size * (1 - 2 * padding);
      const scale = inner / 24;
      const translate = size * padding;
      const bg =
        background != null
          ? `<rect width="${size}" height="${size}" rx="${cornerRadius}" fill="${background}"/>`
          : "";
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
        bg +
        `<g transform="translate(${translate},${translate}) scale(${scale})" fill="${foreground}">` +
        svgNodesToString(icon.svgNodes) +
        `</g>` +
        `</svg>`
      );
    }
  }
}
