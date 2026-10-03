import { adaptiveBarExhibits } from "./internal/adaptive-bar-exhibits";

// Default-export `Exhibit[]` — the shape codegen collects into the exhibit
// catalog's `exhibits.generated.ts`. JSX lives in `internal/adaptive-bar-exhibits.tsx`.
export default adaptiveBarExhibits;
