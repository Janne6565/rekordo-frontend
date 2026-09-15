import { firstPullPercent, firstPullSteps } from "@/features/firstPull/lib";
import { useAppSelector } from "@/store/hooks";
import { useMemo } from "react";

/** Whether the library should wait behind loading 1b rather than draw an empty shelf. */
export function useFirstPullActive(): boolean {
  return useAppSelector((state) => state.firstPull.stage !== "idle");
}

export function useFirstPullLogic() {
  const { stage, copies, wishes } = useAppSelector((state) => state.firstPull);
  const email = useAppSelector((state) => state.auth.user?.email ?? null);
  const steps = useMemo(() => firstPullSteps(stage, copies, wishes), [stage, copies, wishes]);
  return { email, steps, percent: firstPullPercent(steps) };
}
