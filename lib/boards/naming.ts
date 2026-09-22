// What a board is called on screen. Code, URLs and the database keep saying
// "board"; only the words people read change. Switch ACTIVE to preview.
export type BoardNamingKey = "plates" | "folios" | "hours";

export const ACTIVE: BoardNamingKey = "plates";

type Naming = {
  one: string; // "plate"
  many: string; // "plates"
  /** The small kicker above a board's title in a row: "Plate 01", "01:00". */
  kicker: (i: number) => string;
};

const pad = (n: number) => String(n).padStart(2, "0");

const NAMINGS: Record<BoardNamingKey, Naming> = {
  plates: { one: "plate", many: "plates", kicker: (i) => `Plate ${pad(i + 1)}` },
  folios: { one: "folio", many: "folios", kicker: (i) => `Folio ${pad(i + 1)}` },
  hours: { one: "hour", many: "hours", kicker: (i) => `${pad(i + 1)}:00` },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const n = NAMINGS[ACTIVE];
export const BOARD = {
  one: n.one,
  many: n.many,
  One: cap(n.one),
  Many: cap(n.many),
  kicker: n.kicker,
};
