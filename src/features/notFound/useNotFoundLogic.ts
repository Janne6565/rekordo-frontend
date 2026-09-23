import { isBareHandlePath } from "@/features/friends/publicHandle";
import { type NotFoundFrameKind, displayPath, frameFor } from "@/features/notFound/notFoundLogic";
import { useAppSelector } from "@/store/hooks";
import { useRouterState } from "@tanstack/react-router";

export interface NotFoundLogic {
  readonly frame: NotFoundFrameKind;
  readonly signedIn: boolean;
  /** The missing address as typed, for the chip. */
  readonly path: string;
  /** The host the chip puts in front of the path on a wide screen. */
  readonly host: string;
  /** `/@` or `/@/wishlist`: the name is what is missing, not the page (30d). */
  readonly bareHandle: boolean;
}

/** Everything the root not-found page needs to know about where it was reached from. */
export function useNotFoundLogic(): NotFoundLogic {
  const status = useAppSelector((state) => state.auth.status);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return {
    frame: frameFor(status),
    signedIn: status === "signedIn",
    path: displayPath(pathname),
    host: window.location.host,
    bareHandle: isBareHandlePath(pathname),
  };
}
