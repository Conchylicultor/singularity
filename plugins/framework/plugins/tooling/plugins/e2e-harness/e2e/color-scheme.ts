/**
 * Host OS appearance detection, shared by every script that takes screenshots.
 *
 * Headless Chromium hardcodes `prefers-color-scheme: light`, so a
 * `colorMode: "system"` app always renders light in a screenshot even when the
 * user's OS is dark. To mirror what the user actually sees, detect the real OS
 * appearance and emulate it. On macOS `defaults read -g AppleInterfaceStyle`
 * prints "Dark" when dark and exits non-zero (no such key) when light.
 */
import { execFileSync } from "node:child_process";

export type ColorScheme = "dark" | "light";

export function detectOsColorScheme(): ColorScheme {
  if (process.platform !== "darwin") return "light";
  try {
    const out = execFileSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() === "Dark" ? "dark" : "light";
  } catch (err) {
    // A non-zero exit is the documented "no such key" signal — the OS is in
    // Light appearance. Anything else (no `defaults` binary, EACCES, …) means
    // the detection itself is broken, which we must not silently paper over as
    // "light": re-throw so it is visible.
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number" && status !== 0) return "light";
    throw err;
  }
}
