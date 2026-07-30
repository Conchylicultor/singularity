import { useEffect, useMemo, useState } from "react";
import { useConfig } from "@plugins/config_v2/web";
import { useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import { fontFamilyConfig } from "@plugins/ui/plugins/tokens/plugins/font-family/web";
import { loadGoogleFontFamilies } from "./google-font-catalog";
import { preferredFontFamily } from "./preferred-font-family";

const FONT_KEYS = ["fontSans", "fontSerif", "fontMono"] as const;

/**
 * The preferred face of every stack in these token sets.
 *
 * Only heads are collected, never fallbacks: across our 522 imported themes six
 * families appear *only* in fallback position — including `Noto Color Emoji`,
 * roughly 10 MB, in 54 of them, sitting behind an emoji font every OS already
 * ships.
 */
function collectPreferredFamilies(
  tokenSets: Record<string, string>[],
): string[] {
  const names = new Set<string>();
  for (const tokens of tokenSets) {
    for (const key of FONT_KEYS) {
      const value = tokens[key];
      if (value) {
        const preferred = preferredFontFamily(value);
        if (preferred !== null) names.add(preferred);
      }
    }
  }
  return [...names].sort();
}

// Discrete weights every font on Google Fonts is guaranteed to expose. A
// `wght@100..900` range request 400-errors (font silently fails to load) for
// fonts that don't ship the full variable axis, so we list concrete weights
// and let the API serve the nearest available for each.
const REQUESTED_WEIGHTS = [400, 500, 600, 700];

function buildGoogleFontsUrl(familyName: string): string {
  const encoded = familyName.replace(/ /g, "+");
  const weights = REQUESTED_WEIGHTS.join(";");
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weights}&display=swap`;
}

// Establish the connection to the font CDN up front so the first stylesheet +
// font-file fetch doesn't pay the DNS/TLS handshake. Google serves font files
// from a separate crossorigin gstatic origin, hence two preconnects.
function ensurePreconnect(): void {
  const origins: { href: string; crossOrigin: boolean }[] = [
    { href: "https://fonts.googleapis.com", crossOrigin: false },
    { href: "https://fonts.gstatic.com", crossOrigin: true },
  ];
  for (const { href, crossOrigin } of origins) {
    if (document.querySelector(`link[data-google-font-preconnect="${href}"]`)) {
      continue;
    }
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    link.dataset.googleFontPreconnect = href;
    if (crossOrigin) link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

export function GoogleFontsLoader() {
  const state = useTokenGroupPresets("font-family");
  const config = useConfig(fontFamilyConfig) as {
    preset: string;
    overrides: { light?: Record<string, string>; dark?: Record<string, string> };
  };

  // While a dynamic preset source is loading there is nothing to preload yet;
  // fonts kick off as soon as the sources resolve.
  const active = state.pending
    ? null
    : (state.presets.find((p) => p.id === config.preset) ?? state.presets[0] ?? null);

  // The catalog is a deferred import (it must not land in the boot bundle), so
  // it arrives a tick after mount. Resolving it into state — rather than
  // filtering inside the link effect — keeps that effect synchronous and keyed
  // on the *filtered* set: two themes differing only in their system fallbacks
  // then produce the same key, instead of tearing down and re-requesting every
  // font sheet.
  const [googleFamilies, setGoogleFamilies] = useState<ReadonlySet<string> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void loadGoogleFontFamilies().then((families) => {
      if (!cancelled) setGoogleFamilies(families);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fontsToLoad = useMemo(() => {
    if (!active || !googleFamilies) return [];

    const tokenSets: Record<string, string>[] = [active.light, active.dark];
    const ovLight = config.overrides.light;
    const ovDark = config.overrides.dark;
    if (ovLight) tokenSets.push(ovLight);
    if (ovDark) tokenSets.push(ovDark);

    // Only a face Google can actually serve gets a stylesheet. Asking for
    // anything else returns `400 text/html`, which Chromium blocks as an opaque
    // response (ERR_BLOCKED_BY_ORB) — and a blocked sheet is what left
    // `document.fonts.ready` unsettled.
    return collectPreferredFamilies(tokenSets).filter((name) =>
      googleFamilies.has(name),
    );
  }, [active, config.overrides, googleFamilies]);

  const fontsKey = fontsToLoad.join("\0");

  useEffect(() => {
    const needed = new Set(fontsToLoad);

    if (needed.size > 0) ensurePreconnect();

    const existing = new Map<string, HTMLLinkElement>();
    for (const el of document.querySelectorAll<HTMLLinkElement>(
      "link[data-google-font]",
    )) {
      existing.set(el.dataset.googleFont!, el);
    }

    for (const [name, el] of existing) {
      if (!needed.has(name)) el.remove();
    }

    for (const name of needed) {
      if (existing.has(name)) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.dataset.googleFont = name;
      link.href = buildGoogleFontsUrl(name);
      document.head.appendChild(link);
    }

    return () => {
      for (const el of document.querySelectorAll<HTMLLinkElement>(
        "link[data-google-font]",
      )) {
        el.remove();
      }
    };
  }, [fontsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- fontsKey is a stable serialization of fontsToLoad

  return null;
}
