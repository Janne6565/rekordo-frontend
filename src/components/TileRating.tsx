import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * The rating on a shelf tile — screen 25a.
 *
 * Glyphs rather than five icon components: at 10px a lucide star is a shape with a stroke
 * width, and five of them per tile across a screenful of records is a lot of SVG for
 * something the eye reads as a bar. Whole stars only — a half at this size is a smudge.
 *
 * An unrated copy draws nothing at all, not five empty stars. Most shelves are rated in
 * patches, and a grid where every third tile carries a row of hollow glyphs reads as a
 * list of things you have failed to do.
 *
 * Shared with a friend's shelf, where the server has already decided whether the number is
 * ours to see: a copy whose owner keeps ratings to themselves arrives with `rating` null,
 * exactly like one nobody has rated. The two are deliberately indistinguishable from here,
 * so this component must never say which case it is drawing nothing for.
 */
export function TileRating({
  rating,
  size = "tile",
}: {
  readonly rating: number | null | undefined;
  /** `detail` is the sheet's larger set (23a), where the stars sit in a fact cell. */
  readonly size?: "tile" | "detail";
}) {
  const { t } = useTranslation();
  if (rating == null || rating <= 0) return null;

  const filled = Math.min(5, Math.round(rating));
  return (
    <div
      className={cn(
        "flex items-center leading-none",
        size === "tile"
          ? "mt-[3px] h-[13px] text-[10px] tracking-[1.5px]"
          : "mt-[5px] h-[15px] text-[12px] tracking-[2px]",
      )}
      aria-label={t("editor.rate", { count: filled })}
    >
      <span className="text-accent" aria-hidden>
        {"★".repeat(filled)}
      </span>
      <span className="text-ink/20" aria-hidden>
        {"☆".repeat(5 - filled)}
      </span>
    </div>
  );
}
