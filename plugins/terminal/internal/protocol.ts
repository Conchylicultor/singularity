// Client → Server messages

export type SessionCreateMsg = {
  type: "session.create";
  cols: number;
  rows: number;
  cwd?: string;
  command?: string[];
};

export type SessionInputMsg = {
  type: "session.input";
  sessionId: string;
  data: string;
};

export type SessionResizeMsg = {
  type: "session.resize";
  sessionId: string;
  cols: number;
  rows: number;
};

export type SessionDestroyMsg = {
  type: "session.destroy";
  sessionId: string;
};

export type ClientMessage =
  | SessionCreateMsg
  | SessionInputMsg
  | SessionResizeMsg
  | SessionDestroyMsg;

// Server → Client messages

export type SessionCreatedMsg = {
  type: "session.created";
  sessionId: string;
};

export type SessionOutputMsg = {
  type: "session.output";
  sessionId: string;
  data: string;
};

export type SessionExitedMsg = {
  type: "session.exited";
  sessionId: string;
  exitCode: number;
};

export type SessionErrorMsg = {
  type: "session.error";
  error: string;
};

export type ServerMessage =
  | SessionCreatedMsg
  | SessionOutputMsg
  | SessionExitedMsg
  | SessionErrorMsg;
