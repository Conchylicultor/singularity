export interface DiffRenderer {
  facetId: string;
  label: string;
  toComparable: (facetData: unknown) => string[];
}
