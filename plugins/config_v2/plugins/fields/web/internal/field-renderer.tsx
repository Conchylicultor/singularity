import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Fields, type FieldRendererProps } from "./slots";

export function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const entries = Fields.Renderer.useContributions();
  const match = entries.find((e) => e.component.type === field.type);
  if (!match) {
    return <Placeholder>Unknown field type: {field.type.id}</Placeholder>;
  }
  const Comp = match.component;
  return <Comp field={field} value={value} onChange={onChange} />;
}
