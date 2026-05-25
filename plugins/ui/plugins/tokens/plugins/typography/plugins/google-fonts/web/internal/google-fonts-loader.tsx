import { useEffect, useMemo } from "react";
import { useConfig } from "@plugins/config_v2/web";
import { useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import {
  Typography,
  typographyConfig,
} from "@plugins/ui/plugins/tokens/plugins/typography/web";
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

function buildGoogleFontsUrl(familyName: string): string {
  const encoded = familyName.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@100..900&display=swap`;
}

export function GoogleFontsLoader() {
  const presets = useTokenGroupPresets(
    "typography",
    Typography.Preset.useContributions(),
  );
  const config = useConfig(typographyConfig) as {
    preset: string;
    overrides: { light?: Record<string, string>; dark?: Record<string, string> };
  };

  const active = presets.find((p) => p.id === config.preset) ?? presets[0] ?? null;

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
