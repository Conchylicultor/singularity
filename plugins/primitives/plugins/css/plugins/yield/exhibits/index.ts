import { yieldExhibits } from "./internal/yield-exhibits";

// Default-export `Exhibit[]` — the shape codegen collects into the exhibit
// catalog's `exhibits.generated.ts`. JSX lives in `internal/yield-exhibits.tsx`.
export default yieldExhibits;
