import { sectionCardExhibits } from "./internal/section-card-exhibits";

// Default-export `Exhibit[]` — the shape codegen collects into the exhibit
// catalog's `exhibits.generated.ts`. JSX lives in `internal/section-card-exhibits.tsx`.
export default sectionCardExhibits;
