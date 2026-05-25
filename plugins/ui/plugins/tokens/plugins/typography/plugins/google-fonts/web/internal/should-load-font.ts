const EXCLUDED_FONTS = new Set([
  // Bundled locally
  "Inter Variable",
  "Cascadia Code Variable",
  // Common system fonts
  "Georgia",
  "Cambria",
  "Times New Roman",
  "Times",
  "Arial",
  "Helvetica",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Impact",
  "Comic Sans MS",
  "Courier New",
  "Lucida Console",
  "Monaco",
  "Consolas",
  "Segoe UI",
  "Roboto",
  "SF Pro",
  "SF Mono",
  "Menlo",
]);

export function shouldLoadFont(familyName: string): boolean {
  return !EXCLUDED_FONTS.has(familyName);
}
