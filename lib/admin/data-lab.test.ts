import { describe, expect, it } from "vitest";
import { parseDataLabUpload, parseRestaurantTimestamp, validateDataLabRows } from "./data-lab";

describe("Data Lab import", () => {
  it("interprets offset-less timestamps in Asia/Manila", () => {
    expect(parseRestaurantTimestamp("2026-08-27 18:30:00")).toBe("2026-08-27T10:30:00.000Z");
    expect(parseRestaurantTimestamp("2026-08-27T18:30:00+08:00")).toBe("2026-08-27T10:30:00.000Z");
    expect(parseRestaurantTimestamp(25_569)).toBe("1969-12-31T16:00:00.000Z");
  });

  it("parses quoted UTF-8 table CSV rows", async () => {
    const csv = [
      "table_label,zone,capacity,min_party_size,max_party_size,shape",
      'T1,"Main, Window",4,1,4,ROUND',
    ].join("\n");
    const rows = await parseDataLabUpload({
      filename: "tables.csv",
      csvKind: "tables",
      bytes: new TextEncoder().encode(csv),
    });
    expect(rows.tables).toEqual([{ tableLabel: "T1", zone: "Main, Window", capacity: 4, minPartySize: 1, maxPartySize: 4, shape: "ROUND" }]);
  });

  it("rejects overlapping sessions, capacity violations, and invalid outcomes", () => {
    const validation = validateDataLabRows({
      tables: [{ tableLabel: "T1", zone: "Main", capacity: 4, minPartySize: 1, maxPartySize: 4, shape: "SQUARE" }],
      history: [
        { recordId: "one", tableLabel: "T1", partyName: "A", partySize: 4, source: "DIRECT", outcome: "SEATED", seatedAt: "2026-08-27T10:00:00.000Z", clearedAt: "2026-08-27T11:00:00.000Z", availableAt: "2026-08-27T11:10:00.000Z" },
        { recordId: "two", tableLabel: "T1", partyName: "B", partySize: 5, source: "DIRECT", outcome: "SEATED", seatedAt: "2026-08-27T10:30:00.000Z", clearedAt: "2026-08-27T11:20:00.000Z", availableAt: "2026-08-27T11:30:00.000Z" },
      ],
    });
    expect(validation.errors.some((error) => error.includes("capacity"))).toBe(true);
    expect(validation.errors.some((error) => error.includes("overlap"))).toBe(true);
  });

  it("requires reservation schedules and prevents synthetic cancelled seating", () => {
    const validation = validateDataLabRows({
      tables: [{ tableLabel: "R1", zone: "Main", capacity: 2, minPartySize: 1, maxPartySize: 2, shape: "ROUND" }],
      history: [{ recordId: "bad", tableLabel: "R1", partyName: "Party", partySize: 2, source: "RESERVATION", outcome: "CANCELLED", seatedAt: "2026-08-27T10:00:00.000Z" }],
    });
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("scheduled_at"),
      expect.stringContaining("cannot include seating timestamps"),
    ]));
  });

  it("rejects non-seated direct rows and collisions with database history", () => {
    const validation = validateDataLabRows(
      {
        tables: [],
        history: [
          {
            recordId: "direct-cancel",
            tableLabel: "T1",
            partyName: "Party",
            partySize: 2,
            source: "DIRECT",
            outcome: "CANCELLED",
          },
          {
            recordId: "overlap",
            tableLabel: "T1",
            partyName: "Party",
            partySize: 2,
            source: "DIRECT",
            outcome: "SEATED",
            seatedAt: "2026-08-27T10:30:00.000Z",
            clearedAt: "2026-08-27T11:00:00.000Z",
            availableAt: "2026-08-27T11:15:00.000Z",
          },
        ],
      },
      [{ label: "T1", capacity: 4 }],
      [
        {
          tableLabel: "T1",
          seatedAt: "2026-08-27T10:00:00.000Z",
          availableAt: "2026-08-27T10:45:00.000Z",
        },
      ],
    );
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("direct history"),
        expect.stringContaining("overlap"),
      ]),
    );
  });
});
