import type { ReactNode } from "react";
import { GoChip } from "./go-chip";
import { goWire } from "../internal/parse-go";

/**
 * `<go>` beside prose: the suggested prompt highlighted in place, in the
 * paragraph's flow, with the Go chip right after it. `content` is the
 * markdown source between the tags — what the chip sends back.
 */
export function GoInline({
  content,
  children,
}: {
  content: string;
  attrs: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <>
      <span className="rounded-sm bg-primary/10 px-2xs text-primary box-decoration-clone">
        {children}
      </span>{" "}
      <GoChip wire={goWire(content, [])} />
    </>
  );
}
