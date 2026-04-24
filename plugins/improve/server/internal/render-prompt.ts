interface Vars {
  text: string;
  url: string;
  attachments: string;
}

export function renderPrompt(template: string, vars: Vars): string {
  return template
    .replaceAll("{{text}}", vars.text)
    .replaceAll("{{url}}", vars.url)
    .replaceAll("{{attachments}}", vars.attachments);
}

export function formatAttachmentsList(paths: string[]): string {
  if (paths.length === 0) return "(none)";
  return paths.map((p) => `- ${p}`).join("\n");
}
