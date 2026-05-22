import { z } from "zod";
import {
  defineFieldType,
  getFieldResolver,
  type FieldDef,
  type FieldMeta,
} from "@plugins/config_v2/core";

export interface SvgNode {
  tag: string;
  attr: Record<string, string>;
  child: SvgNode[];
}

export interface AvatarSpec {
  icon: string | null;
  color: string | null;
  svgNodes: SvgNode[] | null;
}

const svgNodeSchema: z.ZodType<SvgNode> = z.lazy(() =>
  z.object({
    tag: z.string(),
    attr: z.record(z.string()),
    child: z.array(svgNodeSchema),
  }),
);

const avatarSpecSchema = z.object({
  icon: z.string().nullable(),
  color: z.string().nullable(),
  svgNodes: z.array(svgNodeSchema).nullable().optional(),
}).transform((val): AvatarSpec => {
  const resolver = getFieldResolver("avatar");
  if (resolver) return resolver(val) as AvatarSpec;
  return { icon: val.icon, color: val.color, svgNodes: val.svgNodes ?? null };
}) as z.ZodType<AvatarSpec>;

export const avatarFieldType = defineFieldType<AvatarSpec>("avatar");

export interface AvatarFieldDef extends FieldDef<AvatarSpec> {
  readonly type: typeof avatarFieldType;
}

function pickMeta(opts?: FieldMeta): FieldMeta {
  return {
    label: opts?.label,
    description: opts?.description,
    placeholder: opts?.placeholder,
  };
}

export function avatarField(
  opts?: FieldMeta & { default?: AvatarSpec },
): AvatarFieldDef {
  return Object.freeze({
    type: avatarFieldType,
    schema: avatarSpecSchema,
    defaultValue: opts?.default ?? { icon: null, color: null, svgNodes: null },
    meta: pickMeta(opts),
  });
}
