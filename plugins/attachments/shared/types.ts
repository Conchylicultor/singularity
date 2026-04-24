export interface Attachment {
  id: string;
  ownerType: string | null;
  ownerId: string | null;
  filename: string;
  mime: string;
  size: number;
  diskPath: string;
  createdAt: string;
}
