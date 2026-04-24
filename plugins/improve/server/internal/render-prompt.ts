interface PromptVars {
  text: string;
  url: string;
  attachmentPaths: string[];
}

export function renderPrompt({ text, url, attachmentPaths }: PromptVars): string {
  const hasContext = url || attachmentPaths.length > 0;
  if (!hasContext) return text;

  const lines: string[] = [text, "", "---", "Context:"];
  if (url) lines.push(`- URL: ${url}`);
  for (const p of attachmentPaths) lines.push(`- ${p}`);
  return lines.join("\n");
}
