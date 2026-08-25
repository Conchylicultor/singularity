import type { ControlPanelMark } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import type React from "react";
import { createContext, useContext } from "react";

/**
 * WHAT A HOST SAYS ABOUT A FIELD, as opposed to what the field IS.
 *
 * "Modified", "came from the git tier", "can be reset", "upstream says something
 * else" are all facts the SETTINGS PANE knows and the field does not: the same
 * `boolField` renders in a sonata popover, in an events source form and in the
 * config pane, and only one of those three has tiers or a reset. So they travel
 * as a host-supplied context rather than as props on `FieldShape`, which stays
 * free of presentation — a renderer that could name a stripe or a badge is a
 * renderer that draws chrome again.
 *
 * The four are named for the `ControlPanel` props they become, because that is
 * all they are: `FieldShapeView` hands them to the member it picked. Nothing
 * here decides how they look.
 */
export interface ConfigFieldAdornments {
  /** Chrome-gutter stripe — modified, or in conflict. */
  mark?: ControlPanelMark;
  /** Presentational and never hover-revealed — the tier chip. */
  status?: React.ReactNode;
  /** Hover-revealed trailing cluster — reset. */
  actions?: React.ReactNode;
  /** A line under the row — the "Upstream: …" conflict line. */
  note?: React.ReactNode;
}

/**
 * `null` means NO ADORNING HOST — a popover, an events form — not "an adorning
 * host with nothing to say". The distinction is load-bearing: a member that can
 * hold an action is a different member from one that cannot (see
 * `field-shape-view`), so if presence were derived from the VALUES a toggle
 * would change shape the moment the user edited it.
 */
const ConfigFieldAdornmentsContext =
  createContext<ConfigFieldAdornments | null>(null);

export function ConfigFieldAdornmentsProvider({
  value,
  children,
}: {
  value: ConfigFieldAdornments | null;
  children: React.ReactNode;
}) {
  return (
    <ConfigFieldAdornmentsContext value={value}>
      {children}
    </ConfigFieldAdornmentsContext>
  );
}

export function useConfigFieldAdornments(): ConfigFieldAdornments | null {
  return useContext(ConfigFieldAdornmentsContext);
}
