import { coordsExhibits } from "./internal/coords-exhibits";

// Default-export `Exhibit[]` — the shape codegen collects into the exhibit
// catalog's `exhibits.generated.ts`. JSX lives in `internal/coords-exhibits.tsx`.
export default coordsExhibits;
