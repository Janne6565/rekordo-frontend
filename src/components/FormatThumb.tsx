import { cn } from "@/lib/utils";
import type { Format } from "@janne6565/rekordo-shared";
import type { CSSProperties, ReactNode } from "react";

interface FormatThumbProps {
  readonly format: Format;
  readonly className?: string;
  /**
   * The real cover, drawn into the cover panel.
   *
   * Artwork fills the cover and nothing is drawn over it. The object leans out on the
   * right instead, which is the whole point of the mark: a cover you can actually read,
   * and a format you can read beside it. The node is layered over the paper rather than
   * swapped for it, so a cover that has not arrived — or never will — leaves the
   * placeholder underneath intact.
   */
  readonly cover?: ReactNode;
  /** Runs the loading sweep over the cover, which is the part the artwork will fill. */
  readonly sweep?: boolean;
}

/**
 * How much wider the mark is than its cover.
 *
 * The cover is square and the object leans out beside it, so the composition is 6:5. It is
 * stated here as an aspect on an inner frame rather than assumed of the caller's box: a
 * mark squeezed into a square would draw its record as an ellipse, and there are 47 places
 * that hand this component a box.
 */
const FRAME = "aspect-[6/5]";

const PAPER: CSSProperties = {
  background: "repeating-linear-gradient(135deg,#e3ded4 0 6px,#eae6de 6px 12px)",
};

/** The hairline the cover carries, drawn over the artwork rather than under it. */
const COVER_EDGE: CSSProperties = { boxShadow: "inset 0 0 0 1px rgba(25,23,19,.12)" };

/**
 * The cover panel — a square, the same in every format, and the one the artwork fills.
 *
 * The edge is a sibling rather than this element's own inset shadow, because an inset
 * shadow paints under the element's content and the cover would swallow it. The drop
 * shadow goes on the outer element, which does not clip, since a view that clips its own
 * contents clips its shadow with them.
 */
function Cover({ cover, sweep }: { readonly cover?: ReactNode; readonly sweep?: boolean }) {
  return (
    <div
      className="absolute left-0 top-0 h-full w-[83.333%] rounded-[2px]"
      style={{ boxShadow: "3px 1px 8px rgba(25,23,19,.16)" }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[2px]" style={PAPER}>
        {cover}
        <div className={cn("absolute inset-0", sweep === true && "mc-sweep")} style={COVER_EDGE} />
      </div>
    </div>
  );
}

/**
 * The format mark, ported from Format Marks.dc.html.
 *
 * One rule for all four formats: the cover stays whole and unobscured, and the thing you
 * own leans out from behind it on the right. The format is read from the shape of the
 * sliver rather than from a badge, which is what lets it work at 44px in a dense grid,
 * before any text is legible — vinyl and CD separate on value alone at that size, dark
 * against cream, and the cassette and the plug hold because their edges are straight.
 *
 * It replaced four unrelated compositions: a jewel case, a cassette lying on its case and
 * nine waveform bars, each of which claimed a different amount of the tile and two of
 * which were drawn *over* the artwork. Everything here is CSS gradients and shadows, so
 * there are no image requests and it stays crisp at any size.
 */
export function FormatThumb({ format, className, cover, sweep }: FormatThumbProps) {
  return (
    // Decorative throughout, cover included: the row beside it already names the release,
    // and "album artwork" read out per tile is noise in a grid of two hundred.
    <div className={cn("relative flex h-full w-full", className)} aria-hidden>
      <div className={cn("relative h-full", FRAME)}>
        {format === "VINYL" && <Vinyl />}
        {format === "CD" && <Disc />}
        {format === "CASSETTE" && <Cassette />}
        {format === "DIGITAL" && <Plug />}
        {/* `OTHER` leans nothing out. It is not a format but the absence of one — the
            answer for a copy whose release this client cannot describe yet — so there is
            no object to draw. A bare cover is what "not known" actually looks like. */}
        <Cover cover={cover} sweep={sweep} />
      </div>
    </div>
  );
}

/** The disc box both round formats share: a circle in a 6:5 frame, leaning out on the right. */
const DISC = "absolute right-0 top-[8%] h-[84%] w-[70%] rounded-full";

function Vinyl() {
  return (
    <div
      className={DISC}
      style={{
        // Accent label, then the groove rings the deck cuts: dark on dark, so the disc
        // reads as an object rather than as a black hole in the tile.
        background:
          "radial-gradient(circle at 50% 50%,#a2573a 0 15%,#1a1814 15.5% 17.5%,#26231d 17.5% 42%,#191713 42.6% 44.4%,#2a2620 44.4% 66%,#191713 66.6% 68.4%,#2a2620 68.4% 100%)",
        boxShadow: "0 2px 7px rgba(25,23,19,.28),inset 0 0 0 1px rgba(0,0,0,.35)",
      }}
    />
  );
}

/**
 * The compact disc: the same silhouette as the vinyl, separated from it by value rather
 * than by outline, which is what makes them tell apart at 44px.
 *
 * The iridescence is a real one now. A conic sweep runs the prism — blue, violet, salmon,
 * yellow, green — and a radial sheen from 58% out lays 55% white over the whole rim, which
 * is the only part anyone sees. That is what keeps it a white disc catching light rather
 * than a coloured one: the sweep supplies the hue and the sheen takes most of it back.
 *
 * The rings are doubled on purpose. A dark hairline draws the edge, and a wider white ring
 * just inside it reads as the bevel of the polycarbonate — a single hairline made the disc
 * look like a flat cutout at the sizes where the shadow is doing the separating anyway.
 *
 * The deck also carries the hub and the centre hole; they are not drawn here. The cover
 * ends at 83.33% and both sit entirely behind it, so drawing them costs two elements per
 * tile and shows nothing.
 */
function Disc() {
  return (
    <div
      className={DISC}
      style={{
        background: [
          "radial-gradient(circle at 50% 50%,rgba(255,255,255,0) 0 58%,rgba(255,255,255,.55) 62% 100%)",
          "conic-gradient(from 42deg,#f2f0ec 0 3%,rgba(159,190,214,.95) 9%,rgba(199,164,204,.85) 15%,rgba(214,170,158,.9) 21%,rgba(214,206,158,.75) 26%,rgba(170,206,190,.85) 31%,#f4f2ee 38%,#efede9 55%,rgba(159,190,214,.45) 70%,#f2f0ec 82% 100%)",
        ].join(","),
        boxShadow:
          "0 2px 7px rgba(25,23,19,.26),inset 0 0 0 1.5px rgba(25,23,19,.28),inset 0 0 0 3px rgba(255,255,255,.6)",
      }}
    />
  );
}

/**
 * The shell seen end-on, which is how a cassette sits on a shelf.
 *
 * The mark is read at the rim: only the 16.67% of the frame to the right of the cover is
 * ever visible, so everything here is placed by where it lands in that strip. The shell's
 * gradient lightens from 55% to 94% and darkens again at the very edge, which is the whole
 * of its roundness — the flat left half of that ramp is behind the cover and costs nothing.
 *
 * The two winds are deliberately different sizes: a tape that has been played is wound onto
 * one hub, and drawing both spools equal is the detail that makes a cassette look like an
 * icon of one. The top is the full spool, the bottom the near-empty one.
 */
function Cassette() {
  return (
    <>
      {/* The shell, and the light down its outer edge. */}
      <div
        className="absolute right-0 top-[13%] h-[74%] w-[33%] rounded-[2px_4px_4px_2px]"
        style={{
          background: "linear-gradient(90deg,#211e18 0 55%,#2b2721 82%,#332e26 94%,#262219 100%)",
          boxShadow:
            "0 2px 7px rgba(25,23,19,.3),inset 0 0 0 1px rgba(0,0,0,.42),inset -1px 1px 0 rgba(250,248,245,.09)",
        }}
      />
      {/* The paper label, which is the only light mass in the mark and so the thing that
          separates a cassette from the plug at 44px. */}
      <div
        className="absolute right-[3%] top-[17%] h-[66%] w-[27%] rounded-[1px_3px_3px_1px]"
        style={{
          background: "linear-gradient(90deg,#ddd6c8 0 70%,#e9e3d6 100%)",
          boxShadow: "inset 0 0 0 1px rgba(25,23,19,.22)",
        }}
      />
      {/* The spine the label wraps around. */}
      <div className="absolute right-[3%] top-[17%] h-[66%] w-[2.6%] rounded-[0_3px_3px_0] bg-[#8b8880]" />
      {/* The window, cut through the label into the dark of the shell. */}
      <div
        className="absolute right-[7%] top-[29%] h-[42%] w-[12%] rounded-[5px]"
        style={{
          background: "#14120f",
          boxShadow: "inset 0 0 0 1px rgba(25,23,19,.5),inset 0 1px 2px rgba(0,0,0,.6)",
        }}
      />
      {/* The tape itself: brown, and wound unevenly. */}
      <div
        className="absolute right-[7.5%] top-[33.4%] h-[13.2%] w-[11%] rounded-full"
        style={{ background: "radial-gradient(circle,#3a2c22 0 60%,#2a2019 100%)" }}
      />
      <div
        className="absolute right-[8.75%] top-[54.9%] h-[10.2%] w-[8.5%] rounded-full"
        style={{ background: "radial-gradient(circle,#3a2c22 0 60%,#2a2019 100%)" }}
      />
      {/* The hubs, the same size on both spools whatever is wound on them. */}
      {[35.5, 55.5].map((top) => (
        <div
          key={top}
          className="absolute right-[9.25%] h-[9%] w-[7.5%] rounded-full"
          style={{
            top: `${top}%`,
            background: "radial-gradient(circle,#14120f 0 32%,#e8e3d8 32% 100%)",
            boxShadow: "inset 0 0 0 1px rgba(25,23,19,.4)",
          }}
        />
      ))}
      {/* The two screws at the corners of the shell. */}
      {[15, 82.6].map((top) => (
        <div
          key={top}
          className="absolute right-[1%] h-[2.4%] w-[2%] rounded-full bg-[#0e0d0b]"
          style={{ top: `${top}%` }}
        />
      ))}
    </>
  );
}

/**
 * A USB-A plug leaning out, which is what "digital" is when you actually own a copy of it.
 *
 * It replaced a waveform, which drew a sound rather than a thing — the other three marks
 * are all objects you can hold, and a file on a stick is the honest member of that set.
 */
function Plug() {
  return (
    <>
      {/* The body behind the shell, and the light on it. */}
      <div
        className="absolute right-[13.5%] top-[37%] h-[26%] w-[30%] rounded-[3px]"
        style={{
          background: "linear-gradient(180deg,#3a352d 0 10%,#2a2620 34%,#1d1b17 74%,#26231d 100%)",
          boxShadow:
            "0 3px 7px rgba(25,23,19,.3),inset 0 0 0 1px rgba(0,0,0,.45),inset 0 1px 0 rgba(250,248,245,.14)",
        }}
      />
      <div
        className="absolute right-[15.5%] top-[41.5%] h-[5%] w-[3.5%] rounded-full"
        style={{ background: "#a2573a", boxShadow: "0 0 6px rgba(162,87,58,.85)" }}
      />
      {/* The metal shell, stamped. */}
      <div
        className="absolute right-0 top-[40.5%] h-[19%] w-[15.5%] rounded-[1px_2px_2px_1px]"
        style={{
          background:
            "linear-gradient(180deg,#e3dfd6 0 12%,#c6c1b7 36%,#9c978e 64%,#87827a 84%,#b8b3a8 100%)",
          boxShadow:
            "0 2px 5px rgba(25,23,19,.26),inset 0 0 0 1px rgba(25,23,19,.4),inset -1.5px 0 0 rgba(255,255,255,.35)",
        }}
      />
      {[44, 51.4].map((top) => (
        <div
          key={top}
          className="absolute right-[4.5%] h-[4.6%] w-[3.8%] rounded-[.5px]"
          style={{
            top: `${top}%`,
            background: "#6b665e",
            boxShadow: "inset 0 .5px 1px rgba(25,23,19,.6)",
          }}
        />
      ))}
      {/* Where the shell meets the body. */}
      <div
        className="absolute right-[15.5%] top-[39.5%] h-[21%] w-[.8%]"
        style={{ background: "rgba(0,0,0,.5)" }}
      />
    </>
  );
}

interface EmptySleeveProps {
  /**
   * `sleeve` is the cover with the record gone: the stripes stay and a dashed ring stands
   * where the disc would lean out. `slot` drops the sleeve as well and keeps only the
   * outline of where it stood, which is what an item that no longer exists leaves behind.
   */
  readonly mode: "sleeve" | "slot";
  /** What was asked for, written on the sleeve: an error code, a handle, or nothing. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * The not-found mark (turn 30): a library tile with nothing in it.
 *
 * Built from the same frame, paper and disc box as the format marks, so a miss reads as a
 * gap on the shelf rather than as an error dialog. Decorative, like every other mark: the
 * heading beside it says what happened.
 */
export function EmptySleeve({ mode, label, className }: EmptySleeveProps) {
  return (
    <div className={cn("relative flex h-full w-full justify-center", className)} aria-hidden>
      <div className={cn("relative h-full", FRAME)}>
        {mode === "sleeve" ? (
          <>
            <div className={cn(DISC, "border-[1.5px] border-dashed border-ink/25")} />
            <div
              className="absolute left-0 top-0 h-full w-[83.333%] rounded-[2px]"
              style={{ boxShadow: "3px 1px 8px rgba(25,23,19,.16)" }}
            >
              <div
                className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[2px] px-3"
                style={PAPER}
              >
                {label !== undefined && label !== "" && (
                  <span className="truncate rounded-[3px] bg-paper/85 px-2 py-1 font-mono text-[11px] font-medium tracking-[0.06em] text-ink-muted">
                    {label}
                  </span>
                )}
                <div className="absolute inset-0" style={COVER_EDGE} />
              </div>
            </div>
          </>
        ) : (
          <div className="absolute left-0 top-0 h-full w-[83.333%] rounded-[3px] border-[1.5px] border-dashed border-ink/25" />
        )}
      </div>
    </div>
  );
}
