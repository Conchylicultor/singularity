// Gmail REST API v1 wire types — the raw JSON shapes returned by
// `https://gmail.googleapis.com/gmail/v1/users/me/...`. Web-safe: no server
// imports, no runtime values. Mirror the Google API surface exactly.

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailMessageRef {
  id: string;
  threadId: string;
}

export interface GmailMessageList {
  messages?: GmailMessageRef[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePartBody {
  attachmentId?: string;
  size: number;
  data?: string; // base64url
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailMessagePartBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string; // epoch millis as a string
  sizeEstimate?: number;
  payload?: GmailMessagePart;
}

export interface GmailLabelColor {
  backgroundColor?: string;
  textColor?: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: "system" | "user";
  messageListVisibility?: string;
  labelListVisibility?: string;
  color?: GmailLabelColor;
}

export interface GmailListLabelsResponse {
  labels?: GmailLabel[];
}

// history.list
export interface GmailHistoryMessageRef {
  id: string;
  threadId: string;
  labelIds?: string[];
}

export interface GmailHistoryLabelChange {
  message: GmailHistoryMessageRef;
  labelIds: string[];
}

export interface GmailHistoryRecord {
  id: string;
  messages?: GmailHistoryMessageRef[];
  messagesAdded?: { message: GmailHistoryMessageRef }[];
  messagesDeleted?: { message: GmailHistoryMessageRef }[];
  labelsAdded?: GmailHistoryLabelChange[];
  labelsRemoved?: GmailHistoryLabelChange[];
}

export interface GmailHistoryList {
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId: string;
}
