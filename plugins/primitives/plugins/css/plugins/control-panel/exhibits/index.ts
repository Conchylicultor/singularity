import { controlPanelExhibits } from "./internal/control-panel-exhibits";

// Default-export `Exhibit[]` — the shape codegen collects into the exhibit
// catalog's `exhibits.generated.ts`. JSX lives in `internal/control-panel-exhibits.tsx`.
export default controlPanelExhibits;
