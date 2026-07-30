import { describe, expect, test } from "bun:test";
import { loadGoogleFontFamilies } from "./google-font-catalog";
import { preferredFontFamily } from "./preferred-font-family";

/**
 * The rule the loader applies, in one place: take each stack's preferred face
 * and keep it only if Google can serve it. Mirrors `collectPreferredFamilies`
 * plus the catalog filter in google-fonts-loader.tsx.
 */
async function wouldDownload(stack: string): Promise<string | null> {
  const families = await loadGoogleFontFamilies();
  const preferred = preferredFontFamily(stack);
  return preferred !== null && families.has(preferred) ? preferred : null;
}

describe("preferredFontFamily", () => {
  test("reads the head of the stack, unquoted", () => {
    expect(preferredFontFamily("Inter, sans-serif")).toBe("Inter");
    expect(preferredFontFamily(`"Plus Jakarta Sans", system-ui`)).toBe(
      "Plus Jakarta Sans",
    );
    expect(preferredFontFamily(`'Cascadia Code Variable', monospace`)).toBe(
      "Cascadia Code Variable",
    );
  });

  test("a leading generic means the theme wants a local face", () => {
    expect(preferredFontFamily("system-ui, Roboto, sans-serif")).toBe(null);
    expect(preferredFontFamily("ui-monospace, 'Cascadia Mono', Menlo")).toBe(null);
    expect(preferredFontFamily("-apple-system, BlinkMacSystemFont")).toBe(null);
  });

  test("a variable reference is not a family name", () => {
    expect(preferredFontFamily("var(--font-sans)")).toBe(null);
    // Splitting on commas cuts `var(--font-sans, serif)` in half; the head
    // fragment still carries the paren.
    expect(preferredFontFamily("var(--font-sans, serif)")).toBe(null);
  });

  test("an empty value yields nothing", () => {
    expect(preferredFontFamily("")).toBe(null);
  });
});

describe("which family a stack downloads", () => {
  test("downloads the preferred face when Google serves it", async () => {
    expect(await wouldDownload("Inter, sans-serif")).toBe("Inter");
    expect(await wouldDownload(`"Plus Jakarta Sans", system-ui, sans-serif`)).toBe(
      "Plus Jakarta Sans",
    );
  });

  test("downloads nothing when the preferred face is a system font", async () => {
    // The Tailwind default stacks, which imported themes carry verbatim. These
    // are the requests that returned 400 text/html and got ORB-blocked.
    expect(
      await wouldDownload(
        `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`,
      ),
    ).toBe(null);
    expect(
      await wouldDownload(
        `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
      ),
    ).toBe(null);
    expect(await wouldDownload(`"Segoe UI", Roboto, sans-serif`)).toBe(null);
  });

  test("never reaches past the preferred face for a serveable fallback", async () => {
    // `Roboto` and `Noto Color Emoji` are real Google Fonts, but here they are
    // fallbacks — the stack wants the local face. Downloading them defeats the
    // point of a fallback chain, and Noto Color Emoji is ~10 MB.
    expect(await wouldDownload(`system-ui, Roboto, sans-serif`)).toBe(null);
    expect(
      await wouldDownload(`"Segoe UI", "Noto Color Emoji", sans-serif`),
    ).toBe(null);
  });

  test("downloads a Noto face when it genuinely is the preferred one", async () => {
    expect(await wouldDownload(`"Noto Sans", sans-serif`)).toBe("Noto Sans");
  });

  test("our own bundled families are never fetched from Google", async () => {
    // Shipped locally via @fontsource-variable/*; neither is a Google Fonts
    // family name, so the allowlist rejects both without a special case.
    expect(await wouldDownload("'Inter Variable', sans-serif")).toBe(null);
    expect(await wouldDownload("'Cascadia Code Variable', monospace")).toBe(null);
  });
});
