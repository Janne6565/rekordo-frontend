import type { FirstPullStage } from "@/store/firstPullSlice";

export type StepState = "done" | "busy" | "waiting";
export type StepKey = "collection" | "wishlist" | "catalogue";

export interface FirstPullStep {
  readonly key: StepKey;
  readonly state: StepState;
  /** What arrived for this part so far, or null for a part that is not counted in items. */
  readonly count: number | null;
}

/**
 * The three parts the screen names, derived from the one sync that is actually running.
 *
 * The collection and the wishlist travel in the same sync pages, so they are busy and done
 * together; drawing them one after the other would claim an order the wire does not have.
 */
export function firstPullSteps(
  stage: FirstPullStage,
  copies: number,
  wishes: number,
): readonly FirstPullStep[] {
  const pulled: StepState = stage === "pulling" ? "busy" : "done";
  const catalogue: StepState =
    stage === "pulling" ? "waiting" : stage === "catalogue" ? "busy" : "done";
  return [
    { key: "collection", state: pulled, count: copies },
    { key: "wishlist", state: pulled, count: wishes },
    { key: "catalogue", state: catalogue, count: null },
  ];
}

/** Whole percent of parts done. Only finished parts count, so the bar never runs ahead. */
export function firstPullPercent(steps: readonly FirstPullStep[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((step) => step.state === "done").length;
  return Math.round((done / steps.length) * 100);
}
