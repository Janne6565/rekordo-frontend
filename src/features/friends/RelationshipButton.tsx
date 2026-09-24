import type { ProfileSummaryDto } from "@/api/generated/rekordoAPI.schemas";
import type { useFriendsLogic } from "@/features/friends/useFriendsLogic";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type Logic = Pick<ReturnType<typeof useFriendsLogic>, "signedIn" | "ask">;

/**
 * One button with four states, driven entirely by the server's verdict. The client never
 * works out the relationship for itself — it is a fact about two accounts, not about a
 * page.
 */
export function RelationshipButton({
  person,
  logic,
  touch,
}: {
  readonly person: ProfileSummaryDto;
  readonly logic: Logic;
  /** The phone Find tab's thumb-sized variant (2a). */
  readonly touch?: boolean;
}) {
  const { t } = useTranslation();
  const flat =
    touch === true
      ? "flex-none px-2 text-[12px] font-medium"
      : "flex-none rounded-md px-2.5 py-1 text-[11.5px] font-medium";
  const add =
    touch === true
      ? "h-9 flex-none rounded-lg px-3.5 text-[12px] font-semibold"
      : "flex-none rounded-md px-2.5 py-1 text-[11.5px] font-medium";

  // A stranger gets no verdict to act on — the server answers the same for everybody when
  // nobody is asking — and the whole row already leads to the shelf, which is the only
  // thing they can do here. The invitation to sign in is under the list, said once.
  if (!logic.signedIn) {
    return null;
  }

  switch (person.relationship) {
    case "FRIENDS":
      return <span className={cn(flat, "text-ink-subtle")}>{t("friends.state.friends")}</span>;
    case "REQUEST_SENT":
      return <span className={cn(flat, "text-ink-subtle")}>{t("friends.state.requested")}</span>;
    case "SELF":
      return <span className={cn(flat, "text-ink-subtle")}>{t("friends.state.you")}</span>;
    default:
      return (
        <button
          type="button"
          onClick={() => logic.ask.mutate(person.handle ?? "")}
          disabled={logic.ask.isPending}
          className={cn(add, "bg-ink text-paper disabled:opacity-50")}
        >
          {t("friends.state.add")}
        </button>
      );
  }
}
