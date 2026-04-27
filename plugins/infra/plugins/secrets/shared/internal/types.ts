export interface SecretRef {
  namespace: string;
  key: string;
}

export interface SecretMetadata {
  set: boolean;
  updatedAt?: number;
}
