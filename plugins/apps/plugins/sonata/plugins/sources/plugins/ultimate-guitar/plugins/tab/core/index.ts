// The Ultimate Guitar tab model, pure and framework-free: the source id, the
// normalized raw tab the fetch client returns, and the markup parser that turns
// its `content` into sections → lines → chords. A leaf of its own so both the UG
// source and its alignment child can read the model without importing each
// other (UG web imports the alignment core, so the reverse would be a cycle).
export { UG_SOURCE_ID } from "./source-id";

export { UgTabSchema } from "./raw-tab";
export type { UgTab } from "./raw-tab";

export { parseUgTab, parseUgContent, UgParseError } from "./parse";
export type { UgParseErrorKind, ParsedTab, ParsedLine } from "./parse";

export { inferSections } from "./infer-sections";
export type { InferredSection } from "./infer-sections";
