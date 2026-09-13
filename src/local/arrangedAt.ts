import type { ClockSource } from "@janne6565/rekordo-shared";

/**
 * One stamp for every record an arranging gesture touched.
 *
 * A drag renumbers everything between where a record came from and where it was put down —
 * one place is two records, fifty places is fifty-one, and the very first drag on a shelf
 * is all of them. Handing the real clock to each of those costs a stamp *each*, and a
 * stamp is not free: `StoreProvider`'s clock persists itself on every tick. Those writes
 * queue behind one another and ahead of the write that actually moves the record, which is
 * why dropping a record a long way took longer than dropping it next door.
 *
 * Ticking once is also the truer description. Those records were all placed by one gesture
 * at one instant; they did not each happen at a different time. Identical stamps across
 * *different* records cost nothing, because a clock is only ever compared with the clock of
 * the same field of the same record.
 *
 * Mirrored from rekordo-mobile/src/local/arrangedAt.ts.
 */
export function arrangedAt(clock: ClockSource): ClockSource {
  const stamp = clock.next();
  return { next: () => stamp };
}
