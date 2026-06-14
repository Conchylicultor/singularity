// Exactly one surface is focused per page — a legitimately page-global signal,
// readable from the window keydown handler (outside any React subtree).
let focusedSurfaceId: string | undefined;
export function setFocusedSurfaceId(id: string | undefined): void { focusedSurfaceId = id; }
export function getFocusedSurfaceId(): string | undefined { return focusedSurfaceId; }
