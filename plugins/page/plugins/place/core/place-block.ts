import { MdPlace } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";
import { PlaceDataSchema } from "./schemas";

export const PLACE_TYPE = "place";

/** Parse a numeric attribute, loudly. An attribute that is there but unreadable is a bug, not a default. */
function numberAttr(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(
      `markdown: <place ${name}="${raw}"/> — \`${name}\` must be a number.`,
    );
  }
  return value;
}

/**
 * The `fetched` stamp travels as ISO 8601, not as a raw epoch: this attribute is
 * read by humans and agents in the page's markdown, and "2026-08-18T…" says what
 * "1755518400000" does not.
 */
function timestampAttr(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const value = Date.parse(raw);
  if (Number.isNaN(value)) {
    throw new Error(
      `markdown: <place fetched="${raw}"/> — \`fetched\` must be an ISO 8601 date.`,
    );
  }
  return value;
}

export const placeBlock = defineBlock({
  type: PLACE_TYPE,
  schema: PlaceDataSchema,
  label: "Place",
  icon: MdPlace,
  aliases: ["address", "location", "map", "maps"],
  empty: () => ({}), // no placeId → the search UI
  // The card's first line is the name row inside `Card`'s own padding, wrapped
  // in the block's `Inset y="xs"`. Seat the gutter rail on THAT line rather than
  // on the phantom text line the default assumes.
  gutterFirstLineCenter:
    "calc(var(--space-xs) + var(--pad-card) + var(--line-height-body) / 2)",
  // `<place …/>` — a self-closing tag rather than the derived JSON-attribute
  // fallback, so an agent reading the page through `read_page` sees the place
  // itself. `body: "none"`: a place has no content of its own, so a body on
  // parse is a loud rejection rather than a silent drop.
  //
  // The tag carries the IDENTITY (`provider` + `place-id`) alongside the display
  // fields on purpose: without it a copy/paste would land as an empty search box
  // instead of the same place, and the refresh would have nothing to re-ask.
  markdown: {
    tag: {
      name: "place",
      body: "none",
      attrs: (data) => ({
        name: data.name,
        address: data.address,
        category: data.category,
        maps: data.mapsUrl,
        lat: data.lat,
        lng: data.lng,
        provider: data.providerId,
        "place-id": data.placeId,
        fetched:
          data.fetchedAt === undefined
            ? undefined
            : new Date(data.fetchedAt).toISOString(),
      }),
      parseAttrs: (attrs) => ({
        providerId: attrs.provider,
        placeId: attrs["place-id"],
        name: attrs.name,
        address: attrs.address,
        category: attrs.category,
        mapsUrl: attrs.maps,
        lat: numberAttr(attrs.lat, "lat"),
        lng: numberAttr(attrs.lng, "lng"),
        fetchedAt: timestampAttr(attrs.fetched),
      }),
    },
  },
});
