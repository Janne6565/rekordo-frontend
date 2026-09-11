import { cn } from "@/lib/utils";
import type { DiagnosticsLevel } from "@/local/diagnosticsConsent";

interface ConsentLevelRowProps {
  readonly level: DiagnosticsLevel;
  readonly title: string;
  readonly body: string;
  readonly selected: boolean;
  readonly onSelect: (level: DiagnosticsLevel) => void;
  readonly name: string;
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
}: ConsentLevelRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border bg-surface p-3 transition-colors duration-(--mc-quick)",
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
          "mt-[3px] flex size-[18px] flex-none items-center justify-center rounded-full border transition-colors duration-(--mc-quick)",
          selected ? "border-ink" : "border-line",
        )}
      >
        <span className={cn("size-[9px] rounded-full", selected && "bg-ink")} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold">{title}</span>
        <span className="mt-[3px] block text-[12px] leading-[1.55] text-pretty text-ink-muted">
          {body}
        </span>
      </span>
    </label>
  );
}
