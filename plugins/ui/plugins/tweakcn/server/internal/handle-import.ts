import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { importTweakcnTheme } from "../../core/endpoints";
import { convertTweakcnTheme } from "../../core/convert";
import { _tweakcnThemes } from "./tables";

export const handleImport = implement(
  importTweakcnTheme,
  async ({ body }) => {
    const { themeId } = body;

    // Fetch the theme JSON from tweakcn
    const url = `https://tweakcn.com/r/themes/${themeId}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new HttpError(
        502,
        `Failed to fetch tweakcn theme "${themeId}": ${res.status} ${res.statusText}`,
      );
    }

    const rawJson = (await res.json()) as Record<string, unknown>;

    // Validate shape
    const cssVars = rawJson.cssVars as
      | { theme?: Record<string, string>; light?: Record<string, string>; dark?: Record<string, string> }
      | undefined;
    if (!cssVars?.light || !cssVars?.dark || !cssVars?.theme) {
      throw new HttpError(
        422,
        `tweakcn theme "${themeId}" is missing cssVars.theme, cssVars.light, or cssVars.dark`,
      );
    }

    const label =
      typeof rawJson.name === "string" && rawJson.name.length > 0
        ? rawJson.name
        : themeId;

    const presets = convertTweakcnTheme({
      theme: cssVars.theme,
      light: cssVars.light,
      dark: cssVars.dark,
    });

    const id = crypto.randomUUID();
    const now = new Date();

    await db
      .insert(_tweakcnThemes)
      .values({
        id,
        tweakcnId: themeId,
        label,
        rawJson,
        presets,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: _tweakcnThemes.tweakcnId,
        set: { label, rawJson, presets },
      });

    // Re-read to get the actual row (in case of upsert, id may differ)
    const [row] = await db
      .select()
      .from(_tweakcnThemes)
      .where(eq(_tweakcnThemes.tweakcnId, themeId))
      .limit(1);

    if (!row) {
      throw new HttpError(500, "Failed to read back inserted theme");
    }

    return {
      id: row.id,
      tweakcnId: row.tweakcnId,
      label: row.label,
      presets: row.presets,
      createdAt: row.createdAt.toISOString(),
    };
  },
);
