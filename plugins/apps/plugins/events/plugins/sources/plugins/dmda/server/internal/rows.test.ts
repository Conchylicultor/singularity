import { describe, expect, it } from "bun:test";
import { VisitPageSchema } from "./rows";

// Pinned against a byte-faithful capture of what the site actually serves, not
// against what its field names suggest it serves. The first live run failed on
// exactly this: `page` arrives as the STRING "1".

const LIVE_PAGE = {
  visits: [
    {
      id: 12543,
      city: 1,
      kind: 13,
      title: "Le cimetière du Père Lachaise",
      date: "Dimanche 09 Août à 10h00",
      location: "Paris 20ème",
      picture:
        "https://www.desmotsetdesarts.com/rails/active_storage/blobs/abc/OK1.jpg",
      url: "/visites-guidees/visites-guidees-paris/le-cimetiere-du-pere-lachaise-2",
    },
  ],
  done: false,
  page: "1",
};

describe("VisitPageSchema", () => {
  it("accepts the string-encoded page the site really sends", () => {
    const parsed = VisitPageSchema.parse(LIVE_PAGE);
    expect(parsed.page).toBe(1);
    expect(parsed.done).toBe(false);
    expect(parsed.visits).toHaveLength(1);
  });

  it("accepts a row with no date — one live row genuinely has none", () => {
    const parsed = VisitPageSchema.parse({
      ...LIVE_PAGE,
      visits: [
        {
          id: 1394,
          city: 1,
          kind: 11,
          title: "Bourse de Commerce - Pinault Collection",
          location: "Bourse de Commerce - Pinault Collection",
          picture: "https://www.desmotsetdesarts.com/x.jpg",
          url: "/visites-guidees/musee/bourse-de-commerce",
        },
      ],
    });
    expect(parsed.visits[0]!.date).toBeUndefined();
  });

  it("rejects a payload missing the end-of-list signal", () => {
    const { done: _done, ...withoutDone } = LIVE_PAGE;
    expect(() => VisitPageSchema.parse(withoutDone)).toThrow();
  });

  it("rejects a row missing its title", () => {
    expect(() =>
      VisitPageSchema.parse({
        ...LIVE_PAGE,
        visits: [{ id: 1, url: "/x" }],
      }),
    ).toThrow();
  });
});
