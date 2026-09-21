import { scalePhoto } from "@/features/photos/scalePhoto";
import { useStore } from "@/local/StoreProvider";
import { rememberCopyOrigins } from "@/local/dexieStore";
import { readDefaultCurrency } from "@/local/settings";
import type { Condition, CopyDraft, Format, ManualRelease } from "@janne6565/rekordo-shared";
import {
  catalogueKeyOf,
  catalogueKeysOf,
  createManualCopy,
  createPhoto,
  parseMoneyToCents,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

/** What a file picker produces, matching the server's allowlist. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * Preselected, because the shelf has to draw something.
 *
 * Format is the one field with no honest blank: the library filters by it and an artless
 * copy is drawn as its format's silhouette. Vinyl is the deck's own default (14a) and by
 * some distance the likeliest answer for a record nobody has catalogued.
 */
const DEFAULT_FORMAT: Format = "VINYL";

export interface ManualFields {
  artist: string;
  title: string;
  year: string;
  label: string;
  catalogNumber: string;
  format: Format;
  condition: Condition | "";
  price: string;
  shop: string;
  note: string;
}

const EMPTY_FIELDS: ManualFields = {
  artist: "",
  title: "",
  year: "",
  label: "",
  catalogNumber: "",
  format: DEFAULT_FORMAT,
  condition: "",
  price: "",
  shop: "",
  note: "",
};

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/**
 * Screen 14b — the copy nobody has a record of.
 *
 * Nothing here is looked up. The pressing's facts are stored on the copy itself under a
 * `local:` release id, which is what lets a bootleg, a test press or a tape somebody made
 * live on the same shelf as a catalogued record without inventing a fake archive entry for
 * it.
 */
export function useManualEntryLogic(onAdded: (copyId: string) => void) {
  const { store, clock } = useStore();
  const queryClient = useQueryClient();

  const [fields, setFields] = useState<ManualFields>(EMPTY_FIELDS);
  const [cover, setCover] = useState<File | null>(null);
  const [priceInvalid, setPriceInvalid] = useState(false);

  const set = useCallback(<K extends keyof ManualFields>(key: K, value: ManualFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (key === "price") setPriceInvalid(false);
  }, []);

  /**
   * Artists already on the shelf, offered as completions.
   *
   * Somebody entering a second tape by the same band should not have to spell the name the
   * same way twice — two spellings are two artists on every screen that groups by one.
   */
  const knownArtists = useQuery({
    queryKey: ["manualArtists"],
    queryFn: async () => {
      const copies = await store.listCopies();
      const releases = await store.getReleases(catalogueKeysOf(copies));
      const names = new Set<string>();
      for (const copy of copies) {
        const name = releases.get(catalogueKeyOf(copy) ?? "")?.artistName;
        if (name !== undefined && name.trim() !== "") names.add(name);
      }
      return [...names].sort((a, b) => a.localeCompare(b));
    },
  });

  const typedArtist = fields.artist.trim().toLowerCase();
  /** The first few names that start with what has been typed, and are not it already. */
  const artistSuggestions = useMemo(() => {
    if (typedArtist === "") return [];
    return (knownArtists.data ?? [])
      .filter(
        (name) => name.toLowerCase().startsWith(typedArtist) && name.toLowerCase() !== typedArtist,
      )
      .slice(0, 3);
  }, [knownArtists.data, typedArtist]);

  const save = useMutation({
    mutationFn: async () => {
      const price = fields.price.trim() === "" ? null : parseMoneyToCents(fields.price);
      if (fields.price.trim() !== "" && price === null) {
        setPriceInvalid(true);
        return null;
      }

      const year = Number.parseInt(fields.year.trim(), 10);
      const manual: ManualRelease = {
        manualTitle: blankToNull(fields.title),
        manualArtist: blankToNull(fields.artist),
        manualYear: Number.isNaN(year) ? null : year,
        manualLabel: blankToNull(fields.label),
        manualCatalogNumber: blankToNull(fields.catalogNumber),
        manualFormat: fields.format,
      };
      const draft: CopyDraft = {
        condition: fields.condition === "" ? null : fields.condition,
        sleeveCondition: null,
        catalogArt: "AUTO",
        pricePaidCents: price,
        currency: await readDefaultCurrency(store),
        purchasedOn: null,
        purchasedAt: blankToNull(fields.shop),
        notes: blankToNull(fields.note),
        rating: null,
      };

      const copy = createManualCopy(manual, draft, clock, Date.now(), crypto.randomUUID());
      // Typed in by hand, one record at a time — the origin the feed is actually about.
      await rememberCopyOrigins(store, [copy.id], "MANUAL");
      await store.putCopy(copy);

      // The cover is an ordinary photo of the copy — a manual pressing has no catalogue
      // artwork to prefer, so the photo order alone decides the preview.
      if (cover !== null && ACCEPTED.includes(cover.type)) {
        const photoId = crypto.randomUUID();
        const scaled = await scalePhoto(cover);
        // Bytes first: a photo record with no bytes renders as a permanent placeholder.
        await store.putPhotoBytes(photoId, await scaled.blob.arrayBuffer(), scaled.contentType);
        await store.putPhoto(
          createPhoto(
            {
              copyId: copy.id,
              contentType: scaled.contentType,
              byteSize: scaled.blob.size,
              sortIndex: 0,
            },
            clock,
            Date.now(),
            photoId,
          ),
        );
      }
      return copy;
    },
    onSuccess: async (copy) => {
      if (copy === null) return;
      await queryClient.invalidateQueries();
      setFields(EMPTY_FIELDS);
      setCover(null);
      onAdded(copy.id);
    },
  });

  return {
    fields,
    set,
    cover,
    setCover: (file: File | null) => {
      setCover(file === null || ACCEPTED.includes(file.type) ? file : null);
    },
    artistSuggestions,
    useArtist: (name: string) => set("artist", name),
    priceInvalid,
    /**
     * The two things that name a record on a shelf. The format is preselected rather than
     * required, so "required" here is exactly what the footer says it is.
     */
    canSave: fields.artist.trim() !== "" && fields.title.trim() !== "",
    save: () => save.mutate(),
    saving: save.isPending,
  };
}
