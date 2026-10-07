/** `text` as a markdown blockquote, one `>` per line (blank lines kept as `>`). */
export function quoteMarkdown(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

/** The turn a quick answer makes of a selection: the quote, then the answer. */
export function quotedAnswer(selection: string, answer: string): string {
  return `${quoteMarkdown(selection)}\n\n${answer}`;
}
