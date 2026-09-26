export interface RefAdvancedPayload {
  refName: string;
  sha: string;
  previousSha: string | null;
  [key: string]: unknown;
}
