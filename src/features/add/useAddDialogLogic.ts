import { lookupByBarcode, lookupRelease, searchAlbums } from "@/api/releases";
import { fromCsv } from "@/domain/csv";
import { useSatisfyWishes } from "@/features/wishlist/useSatisfyWishes";
import { useStore } from "@/local/StoreProvider";
import { rememberCopyOrigins } from "@/local/dexieStore";
import {
  clearRecentSearches,
  readDefaultCurrency,
  readRecentSearches,
  rememberSearch,
} from "@/local/settings";
import type {
  Album,
  Artist,
  Copy,
  CopyDraft,
  Format,
  LocalStore,
  McImportResult,
  Release,
} from "@janne6565/rekordo-shared";
import {
  MC_EXTENSION,
  albumResults,
  applyCopyPatch,
  applyMcArchive,
  asWishFormat,
  catalogueKeyOf,
  createAlbumCopy,
  createCopy,
  createManualCopy,
  createWishlistItem,
  isManualReleaseId,
  readMcArchive,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

export type AddTab = "SEARCH" | "BARCODE" | "MANUAL" | "CSV";
export type AddFormatFilter = Format | "ALL";

/** A bare run of 8–14 digits is a scanned or pasted barcode, not a title. */
const BARCODE = /^\d{8,14}$/;

/**
 * How long the field has to stand still before the search runs itself.
 *
 * Long enough that typing an artist's name is one request rather than eleven, short
 * enough that it still feels like the list is following along.
 */
const DEBOUNCE_MS = 350;

/** Below this, a title search matches most of the archive and tells you nothing. */
const MIN_TERM_LENGTH = 2;

/**
 * A copy added from a search result, before anybody has edited it.
 *
 * Takes the currency rather than hardcoding one: since 20a the device has a default, and
 * the whole point of that setting is that it reaches the copies this path creates.
 */
function emptyDraft(currency: string): CopyDraft {
  return {
    condition: null,
    sleeveCondition: null,
    catalogArt: "AUTO",
    pricePaidCents: null,
    currency,
    purchasedOn: null,
    purchasedAt: null,
    notes: null,
    rating: null,
  };
}

/**
 * Fetches and stores one release's cover theme without anyone waiting for it.
 *
 * Failures are swallowed on purpose: the theme is decoration, the copy is already saved,
 * and the detail page asks again for itself if this never lands.
 */
async function warmCoverTheme(release: Release, store: LocalStore): Promise<void> {
  if (release.coverTheme !== null) return;
  const enriched = await lookupRelease(release.id).catch(() => null);
  if (enriched !== null && enriched.coverTheme !== null) {
    await store.cacheReleases([enriched]).catch(() => undefined);
  }
}

/**
 * What an import turned out to be.
 *
 * Tagged rather than merged into one shape with optional fields, because the two say
 * genuinely different things and the wording on screen has to differ: a spreadsheet adds
 * copies and reports the rows it could not place, an archive restores records — copies,
 * wishes and photographs — that were already themselves.
 */
export type ImportResult =
  | ({ readonly kind: "CSV" } & CsvImportResult)
  | ({ readonly kind: "MC" } & McImportResult);

export interface CsvImportResult {
  readonly added: number;
  readonly skipped: number;
}

/**
 * The "Add a copy" modal from screen 6a.
 *
 * A modal rather than the separate page it used to be: adding is something you do *to*
 * the library you are looking at, and coming back to a scroll position you had lost is a
 * small tax paid on every single addition.
 */
export function useAddDialogLogic(
  onClose: () => void,
  /** A search to open with, so "I found a copy" lands on the wish's own results (16d). */
  seedTerm = "",
) {
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const satisfyWishes = useSatisfyWishes();

  const [tab, setTab] = useState<AddTab>("SEARCH");
  const [term, setTerm] = useState(seedTerm);
  const [submitted, setSubmitted] = useState(seedTerm);
  const [format, setFormat] = useState<AddFormatFilter>("ALL");
  /**
   * The row the footer's primary acts on.
   *
   * The release itself rather than its id: a pressing picked inside an artist's
   * discography (screen 10d) is not in `results`, so there is nothing to look an id up in.
   */
  const [selected, setSelected] = useState<Release | null>(null);
  /**
   * What this sitting has produced, for the footer's running count.
   *
   * Session state rather than a read of the collection: the footer is reporting on what
   * *you just did*, and a number derived from the library would also move when a sync
   * landed something from another device.
   */
  const [added, setAdded] = useState({ shelf: 0, wishlist: 0 });
  /**
   * The artist whose discography is open over the results, if any (screen 10d). A pane
   * rather than a route: opening an artist is a detour inside adding a record, and the
   * search underneath is exactly what you come back to.
   */
  const [openArtist, setOpenArtist] = useState<Artist | null>(null);

  /**
   * A typed query answers with records; a scanned one still answers with pressings.
   *
   * The two are not the same question. Barcodes are printed on objects, so a scan has
   * already picked the pressing out for you and listing the record instead would throw
   * that away. Typing a name cannot pick anything, which is the whole reason the search
   * moved up a level.
   */
  const scanned = BARCODE.test(submitted.trim());

  const albumsQuery = useQuery({
    queryKey: ["albumSearch", submitted],
    // Only runs once a search is actually submitted, so typing does not hammer the proxy.
    enabled: submitted.trim() !== "" && !scanned,
    queryFn: () => searchAlbums(submitted.trim()),
  });

  const resultsQuery = useQuery({
    queryKey: ["releaseSearch", submitted],
    enabled: submitted.trim() !== "" && scanned,
    queryFn: () => lookupByBarcode(submitted.trim()),
  });

  /**
   * Which of the results are already in the library.
   *
   * Read from the local store rather than tracked in this component's state: a copy added
   * on another device and pulled in by sync should show as owned here too.
   */
  /**
   * What is already on the shelf, and enough about it to say so on the row.
   *
   * The grade and the year, not only the fact: "in your library" alone leaves you standing
   * in a shop unable to tell whether the copy at home is the one worth replacing. Keyed by
   * release rather than album — owning the CD is not owning the LP.
   */
  const owned = useQuery({
    queryKey: ["ownedMbids"],
    queryFn: async () => {
      const copies = await store.listCopies();
      const byRelease = new Map<string, { condition: Copy["condition"]; addedAt: number }>();
      for (const copy of copies) {
        // Whatever the copy knows: a pressing when one was chosen, the album otherwise.
        // Keying on the pressing alone would leave an album-only copy unmarked, and the
        // row it belongs to would offer to add a record that is already on the shelf.
        const key = catalogueKeyOf(copy);
        if (key === null) continue;
        const existing = byRelease.get(key);
        // The oldest one is the copy somebody thinks of as "the one I have".
        if (existing === undefined || copy.createdAt < existing.addedAt) {
          byRelease.set(key, { condition: copy.condition, addedAt: copy.createdAt });
        }
      }
      return byRelease;
    },
  });

  /** The empty state of the search tab, and the mobile search screen (5a). */
  const recent = useQuery({
    queryKey: ["recentSearches"],
    queryFn: () => readRecentSearches(store),
  });

  const forgetSearches = useMutation({
    mutationFn: () => clearRecentSearches(store),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recentSearches"] });
    },
  });

  const add = useMutation({
    mutationFn: async (release: Release) => {
      // Cache the release alongside the copy: every screen reads release metadata from the
      // local store and must keep working with no network at all.
      await store.cacheReleases([release]);
      const copy = createCopy(
        release,
        emptyDraft(await readDefaultCurrency(store)),
        clock,
        Date.now(),
        crypto.randomUUID(),
      );
      await store.putCopy(copy);
      // One record, added by a person: the only origin that reaches anybody's feed.
      await rememberCopyOrigins(store, [copy.id], "MANUAL");
      return copy;
    },
    onSuccess: async (copy, release) => {
      await queryClient.invalidateQueries({ queryKey: ["copies"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["ownedMbids"] });
      // Screen 16e: filing the record a wish was waiting for takes the entry off the list,
      // whichever way in you used and whether or not you came from the wishlist at all.
      await satisfyWishes(copy, release);
      // A search result carries no cover theme — only the detail lookup samples one, and on
      // a cover the server has never seen that takes seconds. Warm it while the user is
      // still in the sheet, so the record they just added opens already themed.
      void warmCoverTheme(release, store);
      // The row that was acted on has been acted on; leaving it lit invites a second copy
      // of the same pressing from a footer press meant for the sheet as a whole.
      setSelected(null);
      // Deliberately no details step. A copy saves the moment the pill is clicked, and
      // condition and price can be added any time from the copy itself — the same rule the
      // phone follows. Interrupting each add with a form is what made adding four pressings
      // in one sitting four dismissals long.
      setAdded((counts) => ({ ...counts, shelf: counts.shelf + 1 }));
    },
  });

  /**
   * Wanting one, written on the click.
   *
   * No sheet in between. A wish is a release plus the format you want, and the row you
   * clicked already named both — asking again would be asking you to confirm what you just
   * pointed at. Format and note stay editable on the wishlist itself, which is where
   * somebody actually curates the list rather than while they are still searching.
   */
  /**
   * Puts a record on the shelf without naming a pressing.
   *
   * The common path, and deliberately not a degraded one: writing whichever pressing the
   * catalogue ranked first would record a guess as an answer, and nothing afterwards could
   * tell it apart from a pressing somebody actually chose. Null says the honest thing and
   * the pressing can still be named later.
   *
   * Nothing is cached alongside it the way a pressing is. There is no release row to keep,
   * and the album's own metadata is not the app's to mirror -- the shelf draws this copy
   * from what the copy itself carries.
   */
  const addAlbum = useMutation({
    mutationFn: async (album: Album) => {
      const copy = createAlbumCopy(
        album,
        emptyDraft(await readDefaultCurrency(store)),
        clock,
        Date.now(),
        crypto.randomUUID(),
      );
      await store.putCopy(copy);
      await rememberCopyOrigins(store, [copy.id], "MANUAL");
      return copy;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["copies"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["ownedMbids"] });
      setSelected(null);
      setAdded((counts) => ({ ...counts, shelf: counts.shelf + 1 }));
    },
  });

  /**
   * Wants a record, without naming a pressing.
   *
   * A wish has always been able to name only an album -- `releaseId` on it was optional
   * long before a copy's was -- so this is the shape the entry was designed for rather
   * than a concession. The desired format is left unset for the same reason the pressing
   * is: a record has no format until somebody says which copy they are after.
   */
  const wishAlbum = useMutation({
    mutationFn: async (album: Album) => {
      const item = createWishlistItem(
        {
          albumId: album.albumId,
          releaseId: null,
          title: album.title,
          artistName: album.artistName,
          year: album.year,
          desiredFormat: null,
          note: null,
        },
        clock,
        Date.now(),
        crypto.randomUUID(),
      );
      await store.putWishlistItem(item);
      return item;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      setAdded((counts) => ({ ...counts, wishlist: counts.wishlist + 1 }));
    },
  });

  const wish = useMutation({
    mutationFn: async (release: Release) => {
      await store.cacheReleases([release]);
      const item = createWishlistItem(
        {
          albumId: release.albumId,
          releaseId: release.id,
          title: release.title,
          artistName: release.artistName,
          year: release.year,
          desiredFormat: asWishFormat(release.format),
          note: null,
        },
        clock,
        Date.now(),
        crypto.randomUUID(),
      );
      await store.putWishlistItem(item);
      return item;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      setAdded((counts) => ({ ...counts, wishlist: counts.wishlist + 1 }));
    },
  });

  /**
   * Importing an export.
   *
   * Every row is resolved through the metadata proxy before anything is written, so an
   * import either produces a copy attached to a real release or reports the row as
   * skipped — never a copy pointing at an mbid the app knows nothing about.
   */
  async function importRows(file: File): Promise<CsvImportResult> {
    const { rows, skipped: malformed } = fromCsv(await file.text());
    let added = 0;
    let skipped = malformed;
    // Everything this loop creates is an import, however many records that turns out to
    // be. Two hundred rows are one act, and one act is not two hundred lines in the feeds
    // of everybody who knows you.
    const importedIds: string[] = [];
    for (const row of rows) {
      const draft = {
        condition: row.mediaCondition,
        sleeveCondition: row.sleeveCondition,
        catalogArt: "AUTO" as const,
        pricePaidCents: row.pricePaidCents,
        currency: row.currency,
        purchasedOn: row.purchasedOn,
        purchasedAt: row.purchasedAt,
        notes: row.notes,
        rating: row.rating,
      };

      // A hand-entered copy has no archive entry to fetch. Its pressing is described by
      // the row's own columns, and it comes back in as a new manual copy — under a new
      // id, since a `local:` release id is the copy's own and cannot be carried across.
      if (isManualReleaseId(row.releaseId)) {
        if (row.artist === "" && row.title === "") {
          skipped += 1;
          continue;
        }
        const manual = createManualCopy(
          {
            manualTitle: row.title === "" ? null : row.title,
            manualArtist: row.artist === "" ? null : row.artist,
            manualYear: row.year,
            manualLabel: row.label,
            manualCatalogNumber: row.catalogNumber,
            manualFormat: row.format,
          },
          draft,
          clock,
          Date.now(),
          crypto.randomUUID(),
        );
        await store.putCopy(manual);
        importedIds.push(manual.id);
        added += 1;
        continue;
      }

      const release =
        (await store.getRelease(row.releaseId)) ?? (await lookupRelease(row.releaseId));
      if (release === null || release === undefined) {
        skipped += 1;
        continue;
      }
      await store.cacheReleases([release]);
      const imported = createCopy(
        release,
        {
          condition: row.mediaCondition,
          sleeveCondition: row.sleeveCondition,
          catalogArt: "AUTO",
          pricePaidCents: row.pricePaidCents,
          currency: row.currency,
          purchasedOn: row.purchasedOn,
          purchasedAt: row.purchasedAt,
          notes: row.notes,
          rating: row.rating,
        },
        clock,
        Date.now(),
        crypto.randomUUID(),
      );
      // A copy can be a format its release is not, and the export says so. A blank
      // column parses as OTHER, which is why that one is not carried back in: a
      // foreign file with no format at all would otherwise mark every copy Other.
      const overridden =
        row.format !== release.format && row.format !== "OTHER"
          ? applyCopyPatch(imported, { manualFormat: row.format }, clock)
          : imported;
      await store.putCopy(overridden);
      importedIds.push(overridden.id);
      added += 1;
    }
    await rememberCopyOrigins(store, importedIds, "CSV_IMPORT");
    return { added, skipped };
  }

  /**
   * Importing a file, whichever of the two it is.
   *
   * One control rather than two, because the difference between them is not a decision the
   * person is making — they have a file the app wrote and want it back. What differs is
   * what can be promised afterwards, which is why the result says which kind it was: a CSV
   * import can only ever *add* copies, an archive restores the ones it describes.
   */
  const importFile = useMutation<ImportResult, Error, File>({
    mutationFn: async (file) =>
      file.name.toLowerCase().endsWith(`.${MC_EXTENSION}`)
        ? await restoreArchive(file)
        : { kind: "CSV", ...(await importRows(file)) },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });

  async function restoreArchive(file: File): Promise<ImportResult> {
    const contents = readMcArchive(new Uint8Array(await file.arrayBuffer()));
    const restored = await applyMcArchive(store, contents, clock);
    // Filed as a CSV import on purpose: to the feed, "arrived as a file" is the whole
    // distinction, and a restore is one act however many records it carries. A third
    // origin would mean a new value in the server's enum for no difference anyone sees.
    await rememberCopyOrigins(
      store,
      contents.manifest.copies.map((copy) => copy.id),
      "CSV_IMPORT",
    );
    return { kind: "MC", ...restored };
  }

  /**
   * The records and the singles, folded and split the way both clients draw them.
   *
   * Derived rather than stored: `albumResults` is a pure function of the answer, and
   * keeping a copy of its output in state would be one more thing able to disagree with
   * the query that produced it.
   */
  const { records, singles } = albumResults(albumsQuery.data ?? []);

  const all = resultsQuery.data ?? [];
  const results = format === "ALL" ? all : all.filter((release) => release.format === format);

  const search = useCallback((next: string) => {
    setSubmitted(next);
    setSelected(null);
    // A new search invalidates the discography that was opened from the old one.
    setOpenArtist(null);
  }, []);

  /**
   * Recent searches hold things somebody meant, not every prefix they passed through on
   * the way — which is why this is not called from the debounce. A search counts as meant
   * once it is pressed for deliberately (Enter, or repeating an earlier one) or once it
   * produces something that gets added.
   */
  const remember = useCallback(
    (next: string) => {
      void rememberSearch(store, next).then(() =>
        queryClient.invalidateQueries({ queryKey: ["recentSearches"] }),
      );
    },
    [store, queryClient],
  );

  const query = term.trim();
  /**
   * Whether what is in the field is worth sending. A barcode is only a barcode once it is
   * complete, so a half-scanned number never reaches the proxy.
   */
  const queryReady = tab === "BARCODE" ? BARCODE.test(query) : query.length >= MIN_TERM_LENGTH;
  /** Typed something new and the request has not gone out yet. */
  const waiting = queryReady && query !== submitted;

  /**
   * The search runs itself after the field stands still.
   *
   * Adding a record is a search you repeat with small corrections — a misheard title, an
   * artist spelled two ways — and an Enter between every attempt is a keystroke that only
   * ever means "yes, I did mean the thing I just typed". Enter still works, and skips
   * the wait.
   */
  useEffect(() => {
    if (!queryReady) {
      // Emptying or shortening the field drops the results with it, rather than leaving
      // them stranded under a box that no longer says what produced them.
      search("");
      return;
    }
    if (query === submitted) return;
    const timer = setTimeout(() => search(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, queryReady, submitted, search]);

  return {
    tab,
    setTab: useCallback(
      (next: AddTab) => {
        setTab(next);
        setSelected(null);
        // The field is cleared with the tab, so the barcode box never opens holding a
        // half-typed album title that no barcode can ever match — and, now that the
        // search runs itself, never carries one tab's query into the other's request.
        setTerm("");
        search("");
      },
      [search],
    ),
    term,
    setTerm,
    /** Enter — the same search, without waiting out the debounce. */
    submit: useCallback(() => {
      if (query === "") return;
      search(query);
      if (!BARCODE.test(query)) remember(query);
    }, [query, search, remember]),
    canSubmit: query !== "",
    format,
    // Narrowing the filter can take the picked row off screen, and a footer acting on a
    // release you can no longer see is worse than making you pick again.
    setFormat: useCallback((next: AddFormatFilter) => {
      setFormat(next);
      setSelected(null);
    }, []),
    results,
    /**
     * One row per record, with the other editions of each folded underneath it, and the
     * singles that merely share a title kept in their own block.
     */
    records,
    singles,
    /** A scan names a pressing; typing names a record. The list drawn differs with it. */
    scanned,
    /**
     * True from the keystroke, not from the request: the skeletons stand in for the wait
     * as a whole, and a debounce the reader cannot see is still a wait.
     */
    searching: waiting || (scanned ? resultsQuery.isFetching : albumsQuery.isFetching),
    failed: (scanned ? resultsQuery.isError : albumsQuery.isError) && !waiting,
    hasSearched: submitted !== "" || waiting,
    submittedTerm: submitted,
    isOwned: (release: Release) => owned.data?.has(release.id) === true,
    /** The grade and year of the copy already on the shelf, for the row's own line. */
    ownedCopy: (release: Release) => owned.data?.get(release.id) ?? null,
    selected,
    select: setSelected,
    /**
     * Adds the copy and opens its details step over the sheet (screen 8d).
     *
     * The sheet is left mounted underneath rather than closed: the copy is saved the
     * moment this runs, so the step is an offer to say what your copy is like, not a form
     * standing between you and owning the record. Dismissing it puts you back on the same
     * results with the same query, which is what keeps several additions in one sitting
     * possible now that each of them has a second step.
     */
    addRelease: (release: Release) => {
      // The search that found something you kept is one worth offering again.
      if (submitted !== "" && !BARCODE.test(submitted)) remember(submitted);
      add.mutate(release);
    },
    addingMbid: add.isPending ? add.variables?.id : undefined,
    /**
     * The shelf pill on a record row: saved with no pressing named.
     *
     * Deliberately not routed through a pressing picker first. The design's own wording
     * is that most people stop here, so the pill has to be the whole action; naming a
     * pressing is the optional step, not a gate in front of this one.
     */
    addAlbum: (album: Album) => {
      if (submitted !== "" && !BARCODE.test(submitted)) remember(submitted);
      addAlbum.mutate(album);
    },
    addingAlbumId: addAlbum.isPending ? addAlbum.variables?.albumId : undefined,
    /** Whether a record already on the shelf is this one, by whichever id the copy knows. */
    isOwnedAlbum: (album: Album) => owned.data?.has(album.albumId) === true,
    ownedAlbumCopy: (album: Album) => owned.data?.get(album.albumId) ?? null,
    /** The heart pill on a record row: written on the click, like the shelf pill beside it. */
    addWishAlbum: (album: Album) => wishAlbum.mutate(album),
    wishingAlbumId: wishAlbum.isPending ? wishAlbum.variables?.albumId : undefined,
    /** The heart pill: the entry is written on the click, like the shelf pill beside it. */
    addWish: (release: Release) => wish.mutate(release),
    wishingMbid: wish.isPending ? wish.variables?.id : undefined,
    /** What this sitting has produced, for the footer's running count. */
    added,
    /** Artists are only worth asking about for a title search — no artist is named 602537. */
    artistQuery: tab === "BARCODE" ? "" : submitted,
    openArtist,
    showArtist: setOpenArtist,
    closeArtist: () => setOpenArtist(null),
    recentSearches: recent.data ?? [],
    repeatSearch: (term: string) => {
      setTerm(term);
      search(term.trim());
      remember(term);
    },
    clearRecent: () => forgetSearches.mutate(),
    importFile: (file: File) => importFile.mutate(file),
    importing: importFile.isPending,
    importResult: importFile.data,
    /** The archive reader says *why* a file was refused; the CSV path never fails at all. */
    importError: importFile.error?.message ?? null,
    importFailed: importFile.isError,
    close: onClose,
  };
}
