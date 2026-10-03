import { chartKitExhibits } from "./internal/chart-kit-exhibits";

// Default-export `Exhibit[]` — the shape codegen collects into the exhibit
// catalog's `exhibits.generated.ts`. JSX lives in `internal/chart-kit-exhibits.tsx`.
export default chartKitExhibits;
