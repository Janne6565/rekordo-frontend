import { useStore } from "@/local/StoreProvider";
import { useAppSelector } from "@/store/hooks";
import type { Condition, Format, ManualRelease, Release } from "@janne6565/rekordo-shared";
import {
  applyCopyPatch,
  catalogueKeyOf,
  isManualCopy,
  parseIsoDate,
  parseMoneyToCents,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

export interface DetailFields {
  condition: Condition | null;
  sleeveCondition: Condition | null;
  price: string;
  purchasedOn: string;
  purchasedAt: string;
  rating: number | null;
  notes: string;
  /**
   * The pressing's own facts, editable only on a copy that was typed in by hand (14b).
   *
   * A hand-entered record is the one kind whose title can be wrong in a way nothing else
   * will ever correct — no archive is going to fix a typo in a bootleg nobody has listed —
   * so the edit step is where it gets fixed. Blank and unread on a matched copy.
   */
  title: string;
  artist: string;
  year: string;
  label: string;
  catalogNumber: string;
  /**
   * The format of the item you own — the one pressing field every copy may answer.
   *
   * It starts at the catalogue's format on a matched copy rather than blank: a cassette of
   * a record listed as vinyl is a normal thing to own, and correcting it here is cheaper
   * and less destructive than re-matching the copy to another release.
   */
  format: Format | "";
}

/** The queries that read a copy out of the local store, and so change when one is saved. */
const LOCAL_KEYS = ["copy", "copyDetails", "copies", "stats", "wishlist", "cover-photos"];

const BLANK: DetailFields = {
  condition: null,
  sleeveCondition: null,
  price: "",
  purchasedOn: "",
  purchasedAt: "",
  rating: null,
  notes: "",
  title: "",
  artist: "",
  year: "",
  label: "",
  catalogNumber: "",
  format: "",
};

/**
 * The pressing half of the patch — five fields on a hand-entered copy, and on a matched
 * one only the format, and only when it actually moved.
 *
 * Omitted rather than sent as nulls on a matched copy: `applyCopyPatch` restamps every key
 * it is given a value for, and stamping six fields nobody edited would let a save here
 * start winning conflicts against another device's real edits.
 */
function manualPatch(
  copy: { readonly releaseId: string | null; readonly manualFormat: Format | null },
  fields: DetailFields,
  catalogFormat: Format | undefined,
): Partial<ManualRelease> {
  if (!isManualCopy(copy)) {
    // Picking the catalogue's own format is how the override comes off again: the copy
    // goes back to following the archive, including if the archive is corrected later.
    const chosen = fields.format === "" || fields.format === catalogFormat ? null : fields.format;
    return chosen === (copy.manualFormat ?? null) ? {} : { manualFormat: chosen };
  }
  const year = Number.parseInt(fields.year.trim(), 10);
  return {
    manualTitle: blank(fields.title),
    manualArtist: blank(fields.artist),
    manualYear: Number.isNaN(year) ? null : year,
    manualLabel: blank(fields.label),
    manualCatalogNumber: blank(fields.catalogNumber),
    manualFormat: fields.format === "" ? null : fields.format,
  };
}

function blank(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/**
 * The copy details step (screen 8d).
 *
 * It edits a copy that already exists, through the same `applyCopyPatch` every other edit
 * goes through — so a field left blank here is never restamped, and does not start winning
 * merges against a value another device actually set.
 */
export function useCopyDetailsLogic(copyId: string, onSaved: () => void) {
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const signedIn = useAppSelector((state) => state.auth.status === "signedIn");

  const [fields, setFields] = useState<DetailFields>(BLANK);
  /**
   * What the form looked like when it opened.
   *
   * Kept so a backdrop click can tell an accidental one from a deliberate abandonment: a
   * sheet with nothing typed into it closes, a sheet holding edits nudges instead.
   */
  const [baseline, setBaseline] = useState<DetailFields>(BLANK);
  const [priceInvalid, setPriceInvalid] = useState(false);
  const [dateInvalid, setDateInvalid] = useState(false);

  const query = useQuery({
    queryKey: ["copyDetails", copyId],
    queryFn: async () => {
      const copy = await store.getCopy(copyId);
      if (copy === undefined) return null;
      const key = catalogueKeyOf(copy);
      const release: Release | undefined = key === null ? undefined : await store.getRelease(key);
      return { copy, release };
    },
  });

  const copy = query.data?.copy;
  const loadedRelease = query.data?.release;
  useEffect(() => {
    // A copy reached from "Add and edit details" is blank, but the same step opens on a
    // copy that already has details when it is reopened; either way the form starts from
    // what is stored.
    if (copy === undefined) return;
    const loaded: DetailFields = {
      condition: copy.condition,
      sleeveCondition: copy.sleeveCondition,
      price: copy.pricePaidCents === null ? "" : (copy.pricePaidCents / 100).toFixed(2),
      purchasedOn: copy.purchasedOn ?? "",
      purchasedAt: copy.purchasedAt ?? "",
      rating: copy.rating,
      notes: copy.notes ?? "",
      title: copy.manualTitle ?? "",
      artist: copy.manualArtist ?? "",
      // Nullish: a copy stored before these fields existed has no key at all.
      year: copy.manualYear == null ? "" : String(copy.manualYear),
      label: copy.manualLabel ?? "",
      catalogNumber: copy.manualCatalogNumber ?? "",
      format: copy.manualFormat ?? loadedRelease?.format ?? "",
    };
    setFields(loaded);
    setBaseline(loaded);
  }, [copy, loadedRelease]);

  /** Whether anything has been typed since the sheet opened. */
  const dirty = (Object.keys(fields) as (keyof DetailFields)[]).some(
    (key) => fields[key] !== baseline[key],
  );

  const save = useMutation({
    mutationFn: async () => {
      const current = await store.getCopy(copyId);
      if (current === undefined) return;
      await store.putCopy(
        applyCopyPatch(
          current,
          {
            condition: fields.condition,
            sleeveCondition: fields.sleeveCondition,
            pricePaidCents: fields.price.trim() === "" ? null : parseMoneyToCents(fields.price),
            purchasedOn: fields.purchasedOn.trim() === "" ? null : parseIsoDate(fields.purchasedOn),
            purchasedAt: fields.purchasedAt.trim() === "" ? null : fields.purchasedAt.trim(),
            rating: fields.rating,
            notes: fields.notes.trim() === "" ? null : fields.notes,
            ...manualPatch(current, fields, query.data?.release?.format),
          },
          clock,
        ),
      );
    },
    onSuccess: async () => {
      // Only what reads the copy. A bare invalidateQueries() also refetched the release
      // search still mounted behind this sheet — every add ended in a second round trip to
      // Discogs for results nobody had asked for again, out of a quota measured per minute.
      await Promise.all(
        LOCAL_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      onSaved();
    },
  });

  /**
   * Hiding is written straight through rather than waiting for Save.
   *
   * It is not an edit to the record's facts, it is a decision about who may see it, and a
   * privacy switch that only takes effect if you remember to press Save afterwards is the
   * wrong kind of switch. Still a stamped write like any other, so it reaches the other
   * devices instead of losing every merge.
   */
  const setHidden = useMutation({
    mutationFn: async (hidden: boolean) => {
      const current = await store.getCopy(copyId);
      if (current === undefined) return;
      await store.putCopy(applyCopyPatch(current, { hidden }, clock));
    },
    onSuccess: async () => {
      await Promise.all(
        LOCAL_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    },
  });

  const set = useCallback(<K extends keyof DetailFields>(key: K, value: DetailFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (key === "price") setPriceInvalid(false);
    if (key === "purchasedOn") setDateInvalid(false);
  }, []);

  const manual = copy !== undefined && isManualCopy(copy);

  return {
    release: query.data?.release,
    /** Whether this copy's pressing — bar the format, which every copy may set — is its own. */
    manual,
    fields,
    dirty,
    set,
    priceInvalid,
    dateInvalid,
    signedIn,
    save: () => {
      // A blank price means "not recorded", which is different from an unparseable one —
      // the second is a mistake worth surfacing rather than silently discarding.
      if (fields.price.trim() !== "" && parseMoneyToCents(fields.price) === null) {
        setPriceInvalid(true);
        return;
      }
      if (fields.purchasedOn.trim() !== "" && parseIsoDate(fields.purchasedOn) === null) {
        setDateInvalid(true);
        return;
      }
      // A hand-entered copy cleared of its artist or title has nothing left to call it on
      // the shelf. The Save button is disabled for the same reason.
      if (manual && (fields.artist.trim() === "" || fields.title.trim() === "")) return;
      save.mutate();
    },
    canSave: !manual || (fields.artist.trim() !== "" && fields.title.trim() !== ""),
    saving: save.isPending,
    hidden: copy?.hidden ?? false,
    toggleHidden: () => setHidden.mutate(!(copy?.hidden ?? false)),
    hiding: setHidden.isPending,
  };
}
