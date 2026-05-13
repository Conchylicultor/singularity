import { useEffect, useRef } from "react";
import { Shortcuts } from "../slots";
import { getCachedCombo, matchesEvent } from "./parse-keys";

export function ShortcutManager() {
  const shortcuts = Shortcuts.Shortcut.useContributions();
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (import.meta.env.DEV) {
      const byCombo = new Map<string, string[]>();
      for (const s of shortcutsRef.current) {
        const key = s.keys.toLowerCase();
        const ids = byCombo.get(key) ?? [];
        ids.push(s.id);
        byCombo.set(key, ids);
      }
      for (const [combo, ids] of byCombo) {
        if (ids.length > 1) {
          console.warn(
            `[shortcuts] Key combo "${combo}" registered by: ${ids.join(", ")}. ` +
              `Highest priority wins; use "when" guards or distinct priorities to resolve.`,
          );
        }
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = shortcutsRef.current;
      let winner: (typeof active)[number] | null = null;
      let winnerPriority = -Infinity;

      for (const shortcut of active) {
        const parsed = getCachedCombo(shortcut.keys);
        if (!parsed) continue;
        if (!matchesEvent(parsed, e)) continue;
        if (shortcut.when && !shortcut.when()) continue;

        const priority = shortcut.priority ?? 0;
        if (priority > winnerPriority) {
          winner = shortcut;
          winnerPriority = priority;
        }
      }

      if (winner) {
        e.preventDefault();
        winner.handler();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
