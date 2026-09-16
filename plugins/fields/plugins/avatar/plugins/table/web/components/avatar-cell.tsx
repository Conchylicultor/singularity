import type { ReactNode } from "react";
import type { AvatarSpec } from "@plugins/fields/plugins/avatar/core";
import { Avatar } from "@plugins/primitives/plugins/avatar/web";
import type {
  FieldDef,
  TableCellProps,
} from "@plugins/primitives/plugins/data-view/web";

/** An avatar cell's `data` payload. `fallbackKey` is render-time only: it seeds
 *  the derived colour when `color` is null, and is never persisted. */
export type AvatarFieldData = AvatarSpec & { fallbackKey?: string };

/** Thrown when an avatar cell's `data` is not an {@link AvatarFieldData}. */
export class AvatarCellDataError extends Error {
  constructor(field: FieldDef<unknown>, data: unknown) {
    super(
      `avatar cell: field "${field.id}" projected \`data\` that is not an AvatarFieldData (got ${data === null ? "null" : typeof data})`,
    );
    this.name = "AvatarCellDataError";
  }
}

function isNullOr(v: unknown, check: (v: unknown) => boolean): boolean {
  return v === null || check(v);
}

function isAvatarFieldData(data: unknown): data is AvatarFieldData {
  if (typeof data !== "object" || data === null) return false;
  if (!("icon" in data && "color" in data && "svgNodes" in data)) return false;
  const isString = (v: unknown) => typeof v === "string";
  return (
    isNullOr(data.icon, isString) &&
    isNullOr(data.color, isString) &&
    isNullOr(data.svgNodes, Array.isArray) &&
    (!("fallbackKey" in data) ||
      data.fallbackKey === undefined ||
      isString(data.fallbackKey))
  );
}

/** Read-only avatar cell: an icon + colour disc drawn from the field's `data`. */
export function AvatarCell(props: TableCellProps): ReactNode {
  const { data } = props;
  if (!isAvatarFieldData(data))
    throw new AvatarCellDataError(props.field, data);
  return (
    <Avatar
      icon={data.icon}
      color={data.color}
      svgNodes={data.svgNodes}
      fallbackKey={data.fallbackKey}
    />
  );
}

export interface AvatarFieldDefOptions<TRow> {
  id: string;
  label: string;
  /** The row's avatar — becomes the field's `data` projection. */
  avatar: (row: TRow) => AvatarFieldData;
  leading?: boolean;
  visible?: boolean;
}

/**
 * The one typed spelling for an avatar DataView field: `type: "avatar"` with
 * `avatar` wired as `data`, so a wrong payload is a type error here rather than
 * an {@link AvatarCellDataError} at render. Not the config_v2 `avatarField`
 * factory in `fields/avatar/plugins/config`.
 */
export function avatarFieldDef<TRow>(
  def: AvatarFieldDefOptions<TRow>,
): FieldDef<TRow> {
  return {
    id: def.id,
    label: def.label,
    type: "avatar",
    data: def.avatar,
    ...(def.leading !== undefined && { leading: def.leading }),
    ...(def.visible !== undefined && { visible: def.visible }),
  };
}
