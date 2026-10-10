import { InlineText } from "@plugins/primitives/plugins/inline-text/web";
import { GoTag } from "./go-tag";
import { PickedBox } from "./picked-box";

const PICKED_RE = /^\s*[-*+] \[[xX]\] (.*)$/;

/**
 * A `<go>` in the USER's message — an agent suggestion they accepted, possibly
 * reworded — shown in full with the GO tab, in the suggestion highlight. A
 * multi-line region is a block; its `- [x]` lines (the picked items) read as
 * checked boxes. The words go through <InlineText>, so chips inside still render.
 */
export function GoEcho({ body }: { body: string }) {
  const text = body.replace(/^\n+|\n+$/g, "");
  if (!text.includes("\n")) {
    return (
      <span className="rounded-sm bg-primary/10 px-2xs text-primary-text box-decoration-clone">
        <GoTag />
        <InlineText text={text} />
      </span>
    );
  }
  return (
    <span className="block rounded-md bg-primary/10 px-sm py-xs text-primary-text">
      <GoTag />
      {text.split("\n").map((line, i) => {
        const picked = PICKED_RE.exec(line);
        return (
          <span key={i} className="block">
            {picked ? <PickedBox /> : null}
            <InlineText text={picked ? picked[1]! : line} />
          </span>
        );
      })}
    </span>
  );
}
