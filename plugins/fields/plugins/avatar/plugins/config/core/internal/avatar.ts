import { z } from "zod";
import {
  getFieldResolver,
  type FieldDef,
  type FieldMeta,
  pickMeta,
} from "@plugins/fields/core";
import {
  avatarFieldType,
  type AvatarSpec,
  type SvgNode,
} from "@plugins/fields/plugins/avatar/core";

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

export interface AvatarFieldDef extends FieldDef<AvatarSpec> {
  readonly type: typeof avatarFieldType;
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
