import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const PerGroupPresetSchema = z.object({
  light: z.record(z.string(), z.string()),
  dark: z.record(z.string(), z.string()),
});

export const TweakcnThemeSchema = z.object({
  id: z.string(),
  tweakcnId: z.string(),
  label: z.string(),
  presets: z.record(z.string(), PerGroupPresetSchema),
  createdAt: z.string(),
});

export type TweakcnTheme = z.infer<typeof TweakcnThemeSchema>;

export const listTweakcnThemes = defineEndpoint({
  route: "GET /api/tweakcn/themes",
  response: z.array(TweakcnThemeSchema),
});

export const importTweakcnTheme = defineEndpoint({
  route: "POST /api/tweakcn/themes",
  body: z.object({ themeId: z.string() }),
  response: TweakcnThemeSchema,
});

export const deleteTweakcnTheme = defineEndpoint({
  route: "DELETE /api/tweakcn/themes/:id",
  response: z.object({ ok: z.boolean() }),
});
