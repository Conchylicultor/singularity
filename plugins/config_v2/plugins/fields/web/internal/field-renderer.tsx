import { Fields, type FieldRendererProps } from "./slots";

export function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  return <Fields.Renderer.Dispatch field={field} value={value} onChange={onChange} />;
}
