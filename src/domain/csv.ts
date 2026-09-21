import type { Condition, Copy, Format, Release, WishlistItem } from "@janne6565/rekordo-shared";
import {
  CONDITIONS,
  DEFAULT_WISH_SORT,
  FORMATS,
  catalogueKeyOf,
  copyFormat,
  formatCentsForInput,
  hasManualOrder,
  parseMoneyToCents,
  sortWishlist,
} from "@janne6565/rekordo-shared";
/**
 * The collection as a spreadsheet: one row per copy.
 *
 * This is the escape hatch the account screen and the merge prompt both point at. It
 * exists so that "delete my account", "keep the account version" and "clear this browser"
 * are never the only options — a person can always take the collection with them, in a
 * format every other tool on earth can read.
 *
 * `releaseId` leads the row on purpose: it is what makes the export re-importable. The
 * human-readable columns beside it are for the person, not for the parser.
 *
 * Mirrored verbatim in rekordo-mobile; keep the two in step.
 */

export const CSV_COLUMNS = [
  "releaseId",
  "title",
  "artist",
  "year",
  "format",
  "label",
  "catalogNumber",
  "country",
  "mediaCondition",
  "sleeveCondition",
  "pricePaid",
  "currency",
  "purchasedOn",
  "purchasedAt",
  "rating",
  "notes",
] as const;

export interface CsvRow {
  readonly releaseId: string;
  /**
   * The pressing as the file names it, for a row whose `releaseId` is a `local:` one.
   *
   * A hand-entered copy has no archive entry to look up, so these columns — written for
   * the person reading the spreadsheet — are the only record of what it is. Re-importing
   * without them would turn every bootleg in an export into a skipped row.
   */
  readonly title: string;
  readonly artist: string;
  readonly year: number | null;
  readonly format: Format;
  readonly label: string | null;
  readonly catalogNumber: string | null;
  readonly mediaCondition: Condition | null;
  readonly sleeveCondition: Condition | null;
  readonly pricePaidCents: number | null;
  readonly currency: string;
  readonly purchasedOn: string | null;
  readonly purchasedAt: string | null;
  readonly rating: number | null;
  readonly notes: string | null;
}

/** RFC 4180 quoting: only when needed, and a quote inside a field is doubled. */
function quote(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(copies: readonly Copy[], releases: ReadonlyMap<string, Release>): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const copy of copies) {
    const release = releases.get(catalogueKeyOf(copy) ?? "");
    lines.push(
      [
        copy.releaseId ?? "",
        release?.title ?? "",
        release?.artistName ?? "",
        release?.year === null || release?.year === undefined ? "" : String(release.year),
        copyFormat(copy, release),
        release?.label ?? "",
        release?.catalogNumber ?? "",
        release?.country ?? "",
        copy.condition ?? "",
        copy.sleeveCondition ?? "",
        formatCentsForInput(copy.pricePaidCents),
        copy.currency,
        copy.purchasedOn ?? "",
        copy.purchasedAt ?? "",
        copy.rating === null ? "" : String(copy.rating),
        copy.notes ?? "",
      ]
        .map(quote)
        .join(","),
    );
  }
  // A trailing newline, so appending in a text editor does not join two rows.
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Splits one CSV document into rows of fields.
 *
 * Hand-written rather than split on commas: notes routinely contain commas and line
 * breaks ("Gatefold, faint ring wear.\nPlays clean after a wash."), and a naive split
 * would silently shred exactly the field people put the most work into.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // Normalising the newlines first means the state machine only has to know about "\n".
  const input = text.replace(/\r\n?/g, "\n");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character !== '"') {
        field += character;
      } else if (input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A file that ends in a newline leaves one empty row behind; drop it rather than import
  // a blank copy.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function asCondition(value: string): Condition | null {
  const upper = value.trim().toUpperCase().replace("+", "_PLUS");
  return (CONDITIONS as readonly string[]).includes(upper) ? (upper as Condition) : null;
}

export function asFormat(value: string): Format {
  const upper = value.trim().toUpperCase();
  return (FORMATS as readonly string[]).includes(upper) ? (upper as Format) : "OTHER";
}

/**
 * Reads an exported file back.
 *
 * Columns are located by name, not by position, so a file someone reordered or added a
 * column to still imports. A row with no `releaseId` is skipped rather than guessed at —
 * a copy attached to the wrong pressing is worse than a copy that was not imported.
 */
export function fromCsv(text: string): { rows: CsvRow[]; skipped: number } {
  const parsed = parseCsv(text);
  if (parsed.length === 0) return { rows: [], skipped: 0 };

  const header = parsed[0].map((cell) => cell.trim());
  const at = (row: string[], column: string): string => {
    const index = header.indexOf(column);
    return index === -1 ? "" : (row[index] ?? "").trim();
  };

  const rows: CsvRow[] = [];
  let skipped = 0;
  for (const row of parsed.slice(1)) {
    const releaseId = at(row, "releaseId");
    if (releaseId === "") {
      skipped += 1;
      continue;
    }
    const rating = Number.parseInt(at(row, "rating"), 10);
    const year = Number.parseInt(at(row, "year"), 10);
    rows.push({
      releaseId,
      title: at(row, "title"),
      artist: at(row, "artist"),
      year: Number.isNaN(year) ? null : year,
      format: asFormat(at(row, "format")),
      label: at(row, "label") === "" ? null : at(row, "label"),
      catalogNumber: at(row, "catalogNumber") === "" ? null : at(row, "catalogNumber"),
      mediaCondition: asCondition(at(row, "mediaCondition")),
      sleeveCondition: asCondition(at(row, "sleeveCondition")),
      pricePaidCents: parseMoneyToCents(at(row, "pricePaid")),
      currency: at(row, "currency") === "" ? "EUR" : at(row, "currency"),
      purchasedOn: at(row, "purchasedOn") === "" ? null : at(row, "purchasedOn"),
      purchasedAt: at(row, "purchasedAt") === "" ? null : at(row, "purchasedAt"),
      rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
      notes: at(row, "notes") === "" ? null : at(row, "notes"),
    });
  }
  return { rows, skipped };
}

/**
 * The wishlist as a spreadsheet: one row per entry.
 *
 * Separate from the copies export rather than extra rows in it, because the two describe
 * different things — a copy is a record you own, with a price, a condition and a pressing;
 * a wish is an album and the format you are hunting for. One file with half its columns
 * blank on every other row is a file no spreadsheet can pivot.
 *
 * `albumId` leads for the same reason `releaseId` does above: it is what makes the export
 * re-importable, and the human-readable columns beside it are for the person.
 */
export const WISHLIST_CSV_COLUMNS = [
  "albumId",
  "title",
  "artist",
  "year",
  "desiredFormat",
  "note",
  "addedAt",
] as const;

/**
 * The order the list is exported in: the one the person built, when they have built one.
 *
 * A wishlist's order is a statement — "this is the one I am closest to finding" — so an
 * export that arrived in insertion order would throw away the only ranking in the app. It
 * is a decision both clients have to make identically, which is why it lives here rather
 * than at the call site.
 */
export function wishlistExportOrder(items: readonly WishlistItem[]): readonly WishlistItem[] {
  return sortWishlist(items, hasManualOrder(items) ? "MANUAL" : DEFAULT_WISH_SORT);
}

export function wishlistToCsv(items: readonly WishlistItem[]): string {
  const lines = [WISHLIST_CSV_COLUMNS.join(",")];
  for (const item of wishlistExportOrder(items)) {
    lines.push(
      [
        item.albumId,
        item.title,
        item.artistName,
        item.year === null ? "" : String(item.year),
        // "ANY" rather than a blank: a wish with no format named is a deliberate answer —
        // any pressing will do — and an empty cell would read as one nobody filled in.
        item.desiredFormat ?? "ANY",
        item.note ?? "",
        new Date(item.createdAt).toISOString(),
      ]
        .map(quote)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
