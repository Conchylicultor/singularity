/**
 * Abstract desktop wallpaper — the backdrop revealed in "desktop mode" (once any
 * tab floats). A real, full-bleed wallpaper rather than a flat fill.
 *
 * Intentionally PASSIVE: `pointer-events-none` + `aria-hidden`, with no click /
 * pointer handlers, no desktop icons, shortcuts, context menus, or app launcher.
 * Clicking empty desktop does nothing by design. App launching/switching lives in
 * the Home app + app-rail, and the bottom dock ({@link WindowDock}) is a window
 * taskbar — never a launcher. Keep this component a pure, non-interactive SVG; see
 * the plugin CLAUDE.md ("the desktop is a passive backdrop") before adding anything.
 *
 * It's a soft mesh gradient: a diagonal color wash, two large blurred orbs for
 * depth, and one organic ribbon swoosh, finished with faint film grain so it
 * reads as a surface rather than a gradient swatch. Structure leans on the two
 * theme tokens that reliably carry contrast (`--primary`, `--accent`) so the
 * wallpaper stays legible even in near-monochrome presets while coming alive
 * with hue in vivid ones.
 *
 * Pure SVG and fully theme-aware: every color is a theme CSS variable, so it
 * re-tints for light/dark and any preset. `preserveAspectRatio="slice"` fills
 * any aspect ratio.
 */
export function DesktopWallpaper() {
  return (
    <svg
      aria-hidden
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
