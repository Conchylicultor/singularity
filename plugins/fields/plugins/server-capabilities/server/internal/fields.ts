import { Fields as StorageFields } from "./storage";
import { ValueTextCast } from "./value-cast";

/** The server-owned field capability namespace. `Storage` is composed in from
 *  `./storage` and `ValueTextCast` from `./value-cast`, so this library
 *  re-exports ONE `Fields` object carrying every server-owned field capability
 *  (`Fields.Storage` + `Fields.ValueTextCast`) — the barrel itself stays pure
 *  (a plain re-export, no merge logic). */
export const Fields = {
  ...StorageFields,
  ValueTextCast,
};
