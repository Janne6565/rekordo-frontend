import { Button } from "@/components/ui";
import { useStore } from "@/local/StoreProvider";
import { DURATION, UNDO_HOLD, restoreCopy, restoreWishlistItem } from "@janne6565/rekordo-shared";
import { useQueryClient } from "@tanstack/react-query";
import { HeartOff } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

/**
 * Something that has just happened and can still be taken back.
 *
 * Two kinds, one toast: a copy you deleted (screen 12c) and a wishlist entry that left on
 * its own because you filed the record it was waiting for (screen 16e). They are the same
 * promise — "this is gone, unless you say otherwise in the next few seconds" — and a
 * second toast implementation is how the two start disagreeing about how long that is.
 */
export type UndoOffer =
  | { readonly kind: "COPY"; readonly copyId: string }
  | {
      readonly kind: "WISH";
      readonly wishId: string;
      readonly title: string;
      /** When it went on the list, for the line that says how long you had been hunting. */
      readonly wantedSince: number;
    };

interface UndoControls {
  /** Called by the delete, or by the add that satisfied a wish, once the record is tombstoned. */
  readonly offer: (offer: UndoOffer) => void;
  /**
   * The record a reader just took back, so the grid can ring it.
   *
   * A restore and an add are the same event from the library's point of view — something
   * appeared and you need to know where — so they get the same Mark.
   */
  readonly restored: string | null;
}

const UndoContext = createContext<UndoControls | null>(null);

export function useUndo(): UndoControls {
  return useContext(UndoContext) ?? { offer: () => undefined, restored: null };
}

/**
 * The six seconds in which a delete is still a question.
 *
 * Lives above the router rather than on the library page, because the delete happens on
 * the detail page and the toast has to outlive the route that started it.
 */
export function UndoProvider({ children }: { readonly children: ReactNode }) {
  const [pending, setPending] = useState<UndoOffer | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const offer = useCallback((next: UndoOffer) => {
    setPending(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPending(null), UNDO_HOLD);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <UndoContext.Provider value={{ offer, restored }}>
      {children}
      {pending !== null && (
        <UndoToast
          offer={pending}
          onDone={(markCopyId) => {
            window.clearTimeout(timer.current);
            setPending(null);
            setRestored(markCopyId);
          }}
        />
      )}
    </UndoContext.Provider>
  );
}

function UndoToast({
  offer,
  onDone,
}: { readonly offer: UndoOffer; readonly onDone: (markCopyId: string | null) => void }) {
  const { t, i18n } = useTranslation();
  const { store, clock } = useStore();
  const queryClient = useQueryClient();

  const wish = offer.kind === "WISH" ? offer : null;

  const takeItBack = async () => {
    if (offer.kind === "COPY") {
      const copy = await store.getCopyIncludingDeleted(offer.copyId);
      if (copy === undefined) return;
      await store.putCopy(restoreCopy(copy, clock));
      await queryClient.invalidateQueries({ queryKey: ["copies"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      onDone(offer.copyId);
      return;
    }

    const item = await store.getWishlistItemIncludingDeleted(offer.wishId);
    if (item === undefined) return;
    // Reviving is an ordinary stamped write of `deletedAt: null`, exactly as the delete was
    // a stamped write of a timestamp. Anything else loses the next merge it takes part in.
    await store.putWishlistItem(restoreWishlistItem(item, clock));
    await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    onDone(null);
  };

  return (
    // <output> rather than a div with role="status": same announcement, one fewer
    // attribute to get wrong. Lift, like everything else that sits over something else,
    // but it leaves at slow — nobody dismissed it, it simply ran out, and a toast that
    // snaps away reads as an error you missed.
    <output
      // The band is full-width so the pill can centre in it, which means the empty air to
      // either side of the pill is still this element -- and at z-50 it swallowed every
      // click along the bottom of the window, the profile menu included, for as long as
      // the toast was up. The band only positions; the pill is the only part that is
      // actually there to be clicked.
      // 24a: on a phone it sits 10px above the tab bar (56px plus the home indicator),
      // never over it and never behind Safari's own bar underneath.
      className="mc-lift pointer-events-none fixed inset-x-0 bottom-[calc(var(--spacing-safe)+66px)] z-50 flex justify-center sm:bottom-6"
      style={{ transitionDuration: `${DURATION.slow}ms` }}
    >
      <div className="pointer-events-auto flex items-center gap-4 rounded-xl bg-ink px-4 py-2.5 text-paper shadow-[0_12px_32px_rgba(25,23,19,.34)]">
        {wish === null ? (
          <span className="text-[12.5px]">{t("undo.removed")}</span>
        ) : (
          <div className="flex items-center gap-3">
            <HeartOff
              size={15}
              strokeWidth={1.75}
              className="flex-none text-paper/70"
              aria-hidden
            />
            <div>
              <div className="text-[12.5px]">{t("undo.wishSatisfied")}</div>
              <div className="text-[11.5px] text-paper/60">
                {t("undo.wishSince", {
                  title: wish.title,
                  since: new Intl.DateTimeFormat(i18n.language, {
                    month: "short",
                    year: "numeric",
                  }).format(wish.wantedSince),
                })}
              </div>
            </div>
          </div>
        )}
        <Button
          variant="secondary"
          action="copy.restore"
          onClick={takeItBack}
          className="h-[26px] flex-none rounded-md border-0 bg-paper/15 px-2.5 text-[12px] font-semibold text-paper hover:bg-paper/25"
        >
          {t(wish === null ? "undo.action" : "undo.keepIt")}
        </Button>
      </div>
    </output>
  );
}
