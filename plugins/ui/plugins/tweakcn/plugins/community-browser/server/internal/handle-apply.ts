import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { convertTweakcnTheme } from "@plugins/ui/plugins/tweakcn/core";
import { _tweakcnThemes } from "@plugins/ui/plugins/tweakcn/server";
import { applyCatalogTheme } from "../../core/endpoints";
import catalog from "../../shared/catalog.json";
import type { CatalogTheme } from "../../shared/types";

export const handleApply = implement(applyCatalogTheme, async ({ body }) => {
  const { themeId } = body;
  const theme = (catalog as CatalogTheme[]).find((t) => t.id === themeId);
  if (!theme) {
    throw new HttpError(404, `Theme "${themeId}" not found in catalog`);
  }

  const presets = convertTweakcnTheme(theme.cssVars);
  const id = crypto.randomUUID();
  const now = new Date();

  await db
    .insert(_tweakcnThemes)
    .values({
      id,
      tweakcnId: theme.id,
      label: theme.name,
      rawJson: theme.cssVars as Record<string, unknown>,
      presets,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: _tweakcnThemes.tweakcnId,
      set: {
        label: theme.name,
        rawJson: theme.cssVars as Record<string, unknown>,
        presets,
      },
    });

  const [row] = await db
    .select()
    .from(_tweakcnThemes)
    .where(eq(_tweakcnThemes.tweakcnId, theme.id))
    .limit(1);

  if (!row) throw new HttpError(500, "Failed to read back inserted theme");

  return {
    id: row.id,
    tweakcnId: row.tweakcnId,
    label: row.label,
    presets: row.presets,
    createdAt: row.createdAt.toISOString(),
  };
});
