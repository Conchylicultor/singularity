export { lowersToMatch } from "./lower-and-match";
// The real DataView → filter-language lowering, for another plugin's test to
// lower AUTHORED filter trees exactly as the host does (e.g. mail's authored
// mailbox tabs).
export { lowerFilterGroup } from "../internal/evaluate-filter";
