// Client → Server

export type SubscribeMsg = {
  type: "subscribe";
  channel: string;
  fromSequence?: number;
};

export type ClientMessage = SubscribeMsg;

// Server → Client

export interface LogEntryWire {
  seq: number;
  line: string;
  stream: "stdout" | "stderr";
  timestamp: number;
}

export type HistoryMsg = {
  type: "history";
  entries: LogEntryWire[];
};

export type EntryMsg = {
  type: "entry";
} & LogEntryWire;

export type ErrorMsg = {
  type: "error";
  error: string;
};

export type ServerMessage = HistoryMsg | EntryMsg | ErrorMsg;
