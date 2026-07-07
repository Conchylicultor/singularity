/** The platforms equin ships a native download for. */
export type Platform = "macos" | "linux" | "windows";

/** Whether an artifact is downloadable yet, or still pre-release. */
export type DownloadStatus = "available" | "coming-soon";

export interface DownloadEntry {
  /** Stable key (used for React keys and the current-platform match). */
  id: string;
  platform: Platform;
  /** Human-facing platform name shown on the card. */
  label: string;
  /** Where the download points (GitHub Releases while pre-release). */
  href: string;
  status: DownloadStatus;
}

/**
 * The closed platform download matrix. Plain data in `core/` (not a slot): the
 * set of platforms is fully enumerable today and both runtimes could read it —
 * exactly the web-sdk "closed list → core/" case. All three are `coming-soon`
 * for now — no public artifact hosting exists yet, so the hrefs are the
 * GitHub-Releases landing page as a placeholder.
 */
export const DOWNLOADS: readonly DownloadEntry[] = [
  {
    id: "macos",
    platform: "macos",
    label: "macOS",
    href: "https://github.com/equin-ai/equin/releases/latest",
    status: "coming-soon",
  },
  {
    id: "linux",
    platform: "linux",
    label: "Linux",
    href: "https://github.com/equin-ai/equin/releases/latest",
    status: "coming-soon",
  },
  {
    id: "windows",
    platform: "windows",
    label: "Windows",
    href: "https://github.com/equin-ai/equin/releases/latest",
    status: "coming-soon",
  },
];

/**
 * Best-effort platform detection from a user-agent string. Pure so it is
 * testable in isolation; the component passes `navigator.userAgent`. Returns
 * `null` when nothing matches (e.g. an unknown or mobile agent) so the caller
 * simply highlights no card.
 */
export function detectPlatform(userAgent: string): Platform | null {
  const ua = userAgent.toLowerCase();
  // Windows first: its UA never contains "mac"/"linux", so order only matters
  // for the mac-vs-linux overlap, which these two don't share.
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return null;
}
