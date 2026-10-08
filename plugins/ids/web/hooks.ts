import type { AnyIdKind } from "../core";
import { IdKinds, type IdPresenter } from "./slots";

/** Every registered id kind, read at render time from the `IdKinds.Kind` slot. */
export function useIdKinds(): readonly AnyIdKind[] {
  return IdKinds.Kind.useContributions().map((c) => c.kind);
}

/** Every registered presenter, read at render time from `IdKinds.Presenter`. */
export function useIdPresenters(): readonly IdPresenter[] {
  return IdKinds.Presenter.useContributions();
}
