import { cn } from "@/lib/utils";
import type { DiagnosticsLevel } from "@/local/diagnosticsConsent";

interface ConsentLevelRowProps {
  readonly level: DiagnosticsLevel;
  readonly title: string;
  readonly body: string;
  readonly selected: boolean;
  readonly onSelect: (level: DiagnosticsLevel) => void;
  readonly name: string;
  /**
   * `inline` is the compact slip (2a): the title and a short hint share one line and wrap
   * only when the row is too narrow. `stacked` is Settings (2d), where the rows have room
   * and the sentence under the title reads better than a clipped hint.
   */
  readonly layout?: "inline" | "stacked";
}

/**
 * One of the three answers.
 *
 * Rows rather than a trio of pills, because three side-by-side buttons force three
 * three-word labels and the middle one reads as the hedge. Every row shares one fill, one
 * border and one radius: the only thing that distinguishes the chosen row is the mark, so
 * no level is visually recommended.
 *
 * A real radio under the surface — `role` and keyboard behaviour come free, and the group
 * is arrow-navigable, which a div with an onClick would have to reimplement badly.
 */
export function ConsentLevelRow({
  level,
  title,
  body,
  selected,
  onSelect,
  name,
  layout = "stacked",
}: ConsentLevelRowProps) {
  const inline = layout === "inline";
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start rounded-[10px] border bg-surface transition-colors duration-(--mc-quick)",
        inline ? "gap-[11px] px-[13px] py-[11px]" : "gap-3 p-3",
        selected ? "border-ink" : "border-line hover:bg-canvas",
      )}
    >
      <input
        type="radio"
        name={name}
        value={level}
        checked={selected}
        onChange={() => onSelect(level)}
        className="sr-only"
        data-testid={`consent-level-${level}`}
      />
      <span
        aria-hidden
        className={cn(
          "mt-[2px] flex flex-none items-center justify-center rounded-full border transition-colors duration-(--mc-quick)",
          inline ? "size-[17px]" : "size-[18px]",
          selected ? "border-ink" : "border-line",
        )}
      >
        <span className={cn("size-[9px] rounded-full", selected && "bg-ink")} />
      </span>
      {inline ? (
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-[7px]">
          <span className="text-[13px] font-semibold">{title}</span>
          <span className="text-[11.5px] leading-[1.5] text-ink-muted">{body}</span>
        </span>
      ) : (
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold">{title}</span>
          <span className="mt-[3px] block text-[12px] leading-[1.55] text-pretty text-ink-muted">
            {body}
          </span>
        </span>
      )}
    </label>
  );
}
