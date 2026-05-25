import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { TweakcnThemeSchema } from "@plugins/ui/plugins/tweakcn/core";

const CatalogThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  source: z.enum(["registry", "community"]),
  likeCount: z.number().optional(),
  author: z.string().optional(),
  cssVars: z.object({
    theme: z.record(z.string(), z.string()),
    light: z.record(z.string(), z.string()),
    dark: z.record(z.string(), z.string()),
  }),
});

export const getCatalog = defineEndpoint({
  route: "GET /api/tweakcn/community/catalog",
  response: z.object({ themes: z.array(CatalogThemeSchema) }),
});

export const applyCatalogTheme = defineEndpoint({
  route: "POST /api/tweakcn/community/apply",
  body: z.object({ themeId: z.string() }),
  response: TweakcnThemeSchema,
});
