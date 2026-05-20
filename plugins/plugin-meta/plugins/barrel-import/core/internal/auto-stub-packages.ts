export interface AutoStubEntry {
  pkg: string;
  resolveFrom?: string;
}

export const AUTO_STUB_PACKAGES: AutoStubEntry[] = [
  { pkg: "@xterm/xterm", resolveFrom: "plugins/terminal" },
  { pkg: "@xterm/addon-fit", resolveFrom: "plugins/terminal" },
  { pkg: "@xterm/addon-web-links", resolveFrom: "plugins/terminal" },
  { pkg: "@dnd-kit/core" },
  { pkg: "@dnd-kit/sortable" },
  { pkg: "@dnd-kit/utilities" },
  { pkg: "react-diff-view" },
  { pkg: "react-resizable-panels" },
];

export const AUTO_STUB_CSS: string[] = [
  "@xterm/xterm/css/xterm.css",
  "react-diff-view/style/index.css",
];
