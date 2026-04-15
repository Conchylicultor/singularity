import type { EditedFile } from "./protocol";

// Shared descriptor: server imports it for type, client imports it for
// useResource(). Deliberately a plain object so client bundles pull nothing
// from server code.
export interface ResourceDescriptor<T, P extends Record<string, string>> {
  readonly key: string;
  readonly __types?: { value: T; params: P };
}

export const editedFilesResource: ResourceDescriptor<EditedFile[], { id: string }> = {
  key: "edited-files",
};
