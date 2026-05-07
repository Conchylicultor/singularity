import type { CSSProperties, ReactNode } from "react";

export function ThemeScope({
  overrides,
  children,
}: {
  overrides?: Record<string, string>;
  children: ReactNode;
}) {
  if (!overrides) return <>{children}</>;
  return <div style={overrides as CSSProperties}>{children}</div>;
}
