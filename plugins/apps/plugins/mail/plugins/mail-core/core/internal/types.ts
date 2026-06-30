import type {
  MailLabelType,
  MailOutboxOpType,
  MailOutboxStatus,
  MailSyncStatus,
} from "./enums";

// Hand-authored, web-safe domain interfaces mirroring the persisted rows in
// `server/internal/tables.ts`. These use `Date` for timestamps and the closed
// enum types above, so web code can model mail data without importing drizzle
// or the server barrel. Kept in sync with the tables by construction (the
// orchestrator verifies at build time).

/** An email participant — display name optional, address required. */
export interface MailAddress {
  name?: string;
  email: string;
}

export interface MailAccount {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  signature: string | null;
  connectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailSyncState {
  accountId: string;
  historyId: string | null;
  lastFullSyncAt: Date | null;
  lastDeltaSyncAt: Date | null;
  status: MailSyncStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailLabel {
  id: string;
  accountId: string;
  name: string;
  type: MailLabelType;
  color: string | null;
  textColor: string | null;
  parentId: string | null;
  messageListVisibility: string | null;
  labelListVisibility: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailThread {
  id: string;
  accountId: string;
  subject: string | null;
  snippet: string | null;
  participants: MailAddress[];
  lastMessageAt: Date | null;
  messageCount: number;
  unread: boolean;
  starred: boolean;
  important: boolean;
  hasAttachments: boolean;
  labelIds: string[];
  historyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailMessage {
  id: string;
  threadId: string;
  accountId: string;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress[] | null;
  subject: string | null;
  snippet: string | null;
  headers: Record<string, string>;
  bodyText: string | null;
  bodyHtml: string | null;
  internalDate: Date | null;
  unread: boolean;
  starred: boolean;
  isDraft: boolean;
  isSent: boolean;
  sizeEstimate: number | null;
  historyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailMessageLabel {
  messageId: string;
  labelId: string;
  createdAt: Date;
}

export interface MailAttachment {
  id: string;
  messageId: string;
  accountId: string;
  gmailAttachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  inline: boolean;
  contentId: string | null;
  storedAttachmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailDraft {
  id: string;
  accountId: string;
  threadId: string | null;
  gmailDraftId: string | null;
  inReplyToMessageId: string | null;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailOutboxItem {
  id: string;
  accountId: string;
  opType: MailOutboxOpType;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
  status: MailOutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}
