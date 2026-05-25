export interface CatalogTheme {
  id: string;
  name: string;
  tags: string[];
  source: "registry" | "community";
  likeCount?: number;
  author?: string;
  cssVars: {
    theme: Record<string, string>;
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}
