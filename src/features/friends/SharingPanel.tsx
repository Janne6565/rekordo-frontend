import type { SharingSettingsDtoCollectionVisibility } from "@/api/generated/rekordoAPI.schemas";
import { Toggle } from "@/components/ui";
import { useSharingLogic } from "@/features/friends/useSharingLogic";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Check, Copy, EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Each choice with its own literal keys. Spelled out because the translation keys are
 * typed — one built by lowercasing the enum is a key the compiler cannot check exists.
 */
const CHOICES = [
  { value: "ONLY_ME", title: "sharing.choice.only_me.title", body: "sharing.choice.only_me.body" },
  { value: "FRIENDS", title: "sharing.choice.friends.title", body: "sharing.choice.friends.body" },
  { value: "PUBLIC", title: "sharing.choice.public.title", body: "sharing.choice.public.body" },
] as const;

/**
 * Screen 15f — three lists, three separate answers.
 *
 * The collection and the wishlist are asked separately because a public wishlist over a
 * friends-only shelf is the normal case, not an exotic one: what you are hunting for is a
 * much smaller thing to share than what you own.
 */
/**
 * The card is drawn here rather than by the caller.
 *
 * It used to be a wrapper on the account page, which meant that when this returned null —
 * the normal state for anybody who has not claimed a handle — the border, background and
 * padding were still painted and the page showed an empty box with nothing in it.
 */
const CARD = "mt-7 rounded-xl border border-line bg-surface p-5";

export function SharingPanel() {
  const { t } = useTranslation();
  const logic = useSharingLogic();
  const settings = logic.settings;

  // Still asking. Drawing the empty state first would tell somebody who *has* a handle
  // that they need one, for as long as the request takes.
  if (logic.loading) return null;

  /**
   * There is nothing to configure until there is a handle to configure it for — but that
   * is worth saying, not worth hiding. Sharing is the one part of the account somebody
   * comes looking for deliberately, and a section that silently is not there reads as a
   * feature that does not exist rather than one waiting on a single step.
   */
  if (!settings?.handle) {
    return (
      <section className={CARD}>
        <h2 className="font-serif text-[19px] leading-none text-ink">{t("sharing.title")}</h2>
        <p className="mt-1.5 text-[12.5px] leading-normal text-ink-muted">
          {t("sharing.noHandle.body")}
        </p>
        <Link
          to="/friends"
          className="mt-3.5 inline-flex h-[30px] items-center rounded-md border border-line px-3 text-xs text-ink transition-colors hover:bg-canvas"
        >
          {t("sharing.noHandle.action")}
        </Link>
      </section>
    );
  }

  return (
    <section className={cn(CARD, "flex flex-col gap-5")}>
      <div>
        <h2 className="font-serif text-[19px] leading-none text-ink">{t("sharing.title")}</h2>
        <p className="mt-1.5 text-[12.5px] text-ink-muted">@{settings.handle}</p>
      </div>

      <Row
        title={t("sharing.findable.title")}
        body={t("sharing.findable.body")}
        control={
          <Toggle
            checked={settings.findable ?? true}
            onChange={(findable) => logic.set({ findable })}
            label={t("sharing.findable.title")}
          />
        }
      />

      <VisibilityGroup
        legend={t("sharing.collection.legend")}
        value={settings.collectionVisibility ?? "FRIENDS"}
        friendCountLabel={t("sharing.collection.friends")}
        onChange={logic.setCollection}
      />

      <VisibilityGroup
        legend={t("sharing.wishlist.legend")}
        value={settings.wishlistVisibility ?? "FRIENDS"}
        friendCountLabel={t("sharing.collection.friends")}
        onChange={logic.setWishlist}
        note={t("sharing.wishlist.note")}
      />

      {/* One link per list that is actually public, because they are two different pages
          and two different decisions. Showing only the wishlist's meant somebody who had
          opened their collection to the world had no way to find the address of it. */}
      {(settings.collectionVisibility === "PUBLIC" || settings.wishlistVisibility === "PUBLIC") && (
        <div className="flex flex-col gap-2">
          {settings.collectionVisibility === "PUBLIC" && (
            <PublicLink handle={settings.handle} label={t("sharing.link.collection")} />
          )}
          {settings.wishlistVisibility === "PUBLIC" && (
            <PublicLink
              handle={settings.handle}
              path="/wishlist"
              label={t("sharing.link.wishlist")}
            />
          )}
        </div>
      )}

      <Row
        title={t("sharing.prices.title")}
        body={settings.pricesPublic ? t("sharing.prices.on") : t("sharing.prices.off")}
        control={
          <Toggle
            checked={settings.pricesPublic ?? false}
            onChange={(pricesPublic) => logic.set({ pricesPublic })}
            label={t("sharing.prices.title")}
          />
        }
      />

      {/* Under the prices row and shaped exactly like it, because it is the same kind of
          answer: a fact the copies already carry, which travels with them or does not.
          Nothing here promises the other side can tell an unrated record from a hidden
          one — they cannot, and that is the point of the switch. */}
      <Row
        title={t("sharing.ratings.title")}
        body={settings.ratingsShared ? t("sharing.ratings.on") : t("sharing.ratings.off")}
        control={
          <Toggle
            checked={settings.ratingsShared ?? true}
            onChange={(ratingsShared) => logic.set({ ratingsShared })}
            label={t("sharing.ratings.title")}
          />
        }
      />

      <p className="flex items-start gap-2 rounded-lg bg-paper px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-muted">
        <EyeOff size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 flex-none" />
        {t("sharing.perCopyNote")}
      </p>
    </section>
  );
}

function Row({
  title,
  body,
  control,
}: { readonly title: string; readonly body: string; readonly control: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{title}</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{body}</div>
      </div>
      <div className="flex-none pt-0.5">{control}</div>
    </div>
  );
}

interface VisibilityGroupProps {
  readonly legend: string;
  readonly value: SharingSettingsDtoCollectionVisibility;
  readonly friendCountLabel: string;
  readonly onChange: (value: SharingSettingsDtoCollectionVisibility) => void;
  readonly note?: string;
}

/**
 * Radios rather than a dropdown: all three answers and what each of them means have to be
 * readable at once. A privacy setting somebody has to open a menu to compare is one they
 * will get wrong.
 */
function VisibilityGroup({ legend, value, onChange, note }: VisibilityGroupProps) {
  const { t } = useTranslation();
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
        {legend}
      </legend>
      <div className="overflow-hidden rounded-xl border border-line">
        {CHOICES.map((choice) => (
          <label
            key={choice.value}
            className={cn(
              // `relative` is load-bearing, not decoration. The radio below is `sr-only`,
              // which is `position: absolute`; with no positioned ancestor its containing
              // block is the initial one, so its static position is resolved in *document*
              // coordinates. Sitting a thousand pixels down a scrolled column, it stretched
              // <html> past the viewport, and focusing it scrolled the whole app -- sidebar
              // and all -- off screen. Same reason Toggle's label is relative.
              "relative flex cursor-pointer items-start gap-3 border-b border-line px-3.5 py-3 last:border-b-0 transition-colors duration-(--mc-quick)",
              value === choice.value ? "bg-surface" : "hover:bg-surface/60",
            )}
          >
            <input
              type="radio"
              name={legend}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full border",
                value === choice.value ? "border-ink bg-ink text-paper" : "border-line",
              )}
            >
              {value === choice.value && <Check size={11} strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink">{t(choice.title)}</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                {t(choice.body)}
              </span>
            </span>
          </label>
        ))}
      </div>
      {note && <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{note}</p>}
    </fieldset>
  );
}

/**
 * The copyable link.
 *
 * Built from the page's own origin rather than from anything the server sends: the app is
 * served from more than one host, and a link that names the wrong one is worse than no
 * link at all.
 */
/**
 * One public address, with the label saying which list it opens.
 *
 * The label earns its place as soon as there can be two: `/@janne` and `/@janne/wishlist`
 * truncate to nearly the same string in this width, and a copy button beside the wrong one
 * is a link sent to the wrong place.
 */
function PublicLink({
  handle,
  path = "",
  label,
}: { readonly handle: string; readonly path?: string; readonly label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/@${handle}${path}`;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
      <span className="flex-none font-mono text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-muted">
        {url.replace(/^https?:\/\//, "")}
      </span>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex flex-none items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-ink transition-colors duration-(--mc-quick) hover:bg-surface"
      >
        {copied ? (
          <Check size={13} strokeWidth={2.2} aria-hidden />
        ) : (
          <Copy size={13} strokeWidth={1.9} aria-hidden />
        )}
        {copied ? t("sharing.copied") : t("sharing.copy")}
      </button>
    </div>
  );
}
