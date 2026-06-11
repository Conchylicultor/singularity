import { useEffect, useMemo } from "react";
import { useConfig } from "@plugins/config_v2/web";
import { useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import { fontFamilyConfig } from "@plugins/ui/plugins/tokens/plugins/font-family/web";
import { parseFontFamilies } from "./parse-font-families";
import { shouldLoadFont } from "./should-load-font";

const FONT_KEYS = ["fontSans", "fontSerif", "fontMono"] as const;

function collectFontNames(
  tokenSets: Record<string, string>[],
): string[] {
  const names = new Set<string>();
  for (const tokens of tokenSets) {
    for (const key of FONT_KEYS) {
      const value = tokens[key];
      if (value) {
        for (const family of parseFontFamilies(value)) {
          names.add(family);
        }
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

  const fontsToLoad = useMemo(() => {
    if (!active) return [];

    const tokenSets: Record<string, string>[] = [active.light, active.dark];
    const ovLight = config.overrides.light;
    const ovDark = config.overrides.dark;
    if (ovLight) tokenSets.push(ovLight);
    if (ovDark) tokenSets.push(ovDark);

    return collectFontNames(tokenSets).filter(shouldLoadFont);
  }, [active, config.overrides]);

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
