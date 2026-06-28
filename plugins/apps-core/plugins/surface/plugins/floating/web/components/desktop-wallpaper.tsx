import { useConfig } from "@plugins/config_v2/web";
import { wallpaperConfig } from "@plugins/apps-core/plugins/surface/plugins/floating/plugins/wallpaper/core";

/**
 * The desktop backdrop revealed in "desktop mode" (once any tab floats). Reads
 * the GLOBAL {@link wallpaperConfig}: when an image is set it paints that image
 * full-bleed (served same-origin, cache-busted by `version`); otherwise it falls
 * back to the {@link DefaultGradientBackdrop} theme-driven SVG.
 *
 * The backdrop stays NON-INTERACTIVE: both branches are `aria-hidden`, and the
 * image carries no pointer handlers. The desktop's right-click affordance is a
 * SEPARATE capture layer ({@link DesktopContextMenu}) mounted above this in the
 * floating Foreground — so the backdrop never eats clicks itself. See the plugin
 * CLAUDE.md ("the desktop is a passive backdrop, plus a context menu").
 */
export function DesktopWallpaper() {
  const { state } = useConfig(wallpaperConfig);

  if (state.kind === "image") {
    return (
      <img
        aria-hidden
        src={`/api/wallpaper/image?v=${state.version}`}
        alt=""
        // eslint-disable-next-line layout/no-adhoc-layout -- full-bleed wallpaper image: the <img> is itself the absolute backdrop layer (size-full + object-cover crop), not an Overlay wrapping content
        className="pointer-events-none absolute inset-0 size-full object-cover"
      />
    );
  }

  return <DefaultGradientBackdrop />;
}

/**
 * The default, theme-driven gradient backdrop — used when no wallpaper image is
 * set. A soft mesh gradient: a diagonal color wash, two large blurred orbs for
 * depth, and one organic ribbon swoosh, finished with faint film grain so it
 * reads as a surface rather than a gradient swatch. Structure leans on the two
 * theme tokens that reliably carry contrast (`--primary`, `--accent`) so the
 * wallpaper stays legible even in near-monochrome presets while coming alive
 * with hue in vivid ones.
 *
 * Pure SVG and fully theme-aware: every color is a theme CSS variable, so it
 * re-tints for light/dark and any preset. `preserveAspectRatio="slice"` fills
 * any aspect ratio. Stays `pointer-events-none` + `aria-hidden`.
 */
function DefaultGradientBackdrop() {
  return (
    <svg
      aria-hidden
      // eslint-disable-next-line layout/no-adhoc-layout -- passive full-bleed wallpaper: the SVG element is itself the absolute backdrop layer (its own viewBox + size-full), not an Overlay wrapping content
      className="pointer-events-none absolute inset-0 size-full"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="desktop-wp-wash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.65" />
          <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.16" />
        </linearGradient>
        <radialGradient id="desktop-wp-orb-a" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="desktop-wp-orb-p" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.30" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="desktop-wp-ribbon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
        </linearGradient>

        <filter
          id="desktop-wp-soft"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
        >
          <feGaussianBlur stdDeviation="44" />
        </filter>
        <filter id="desktop-wp-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      {/* Overall diagonal color wash. */}
      <rect width="100%" height="100%" fill="url(#desktop-wp-wash)" />

      {/* Large blurred orbs for depth. */}
      <circle cx="180" cy="120" r="620" fill="url(#desktop-wp-orb-a)" />
      <circle cx="1480" cy="940" r="680" fill="url(#desktop-wp-orb-p)" />

      {/* Organic ribbon swoosh. */}
      <g filter="url(#desktop-wp-soft)">
        <path
          d="M -120 520 C 420 360 980 700 1720 460 L 1720 1120 L -120 1120 Z"
          fill="url(#desktop-wp-ribbon)"
        />
      </g>

      <rect
        width="100%"
        height="100%"
        filter="url(#desktop-wp-grain)"
        opacity="0.02"
      />
    </svg>
  );
}
