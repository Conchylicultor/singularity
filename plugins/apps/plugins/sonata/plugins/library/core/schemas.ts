import { z } from "zod";
import { fieldsToZodObject, nullable, type FieldsRecord } from "@plugins/fields/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";

/**
 * A persisted Sonata song — **source-agnostic** generic metadata only. The raw
 * per-source data (e.g. the MIDI attachment, a chord-grid's JSON) lives in each
 * source's own entity-extension side-table, owned by that source plugin; the
 * core row never names a source. `durationSec`/`endBeat` are score-level (the
 * composed timeline's length), not tied to any one source.
 *
 * The physical table (server) and this wire schema both derive from this single
 * `songFields` record, so a column/schema drift is unrepresentable. `createdAt`
 * crosses the wire as a Date (`z.coerce.date()` parses the serialised ISO string
 * back into a Date on the client); the DB defaults it to `now()`.
 *
 * `source` is the opaque id of the input source that created the song (MIDI,
 * chord-grid, …), stamped once at creation and never changed. The library treats
 * it as an opaque tag — it never enumerates or interprets source ids; the value
 * always equals the creating source's `Library.Source` / `Sonata.Source` id, and
 * display labels are resolved through the generic `Sonata.Source` registry.
 */
export const songFields = {
  id:          textField(),
  title:       textField(),
  composer:    nullable(textField()),
  durationSec: floatField(),
  endBeat:     floatField(),
  createdAt:   dateField(),
  source:      textField(),
} satisfies FieldsRecord;

export const SongSchema = fieldsToZodObject(songFields);

export type Song = z.infer<typeof SongSchema>;
