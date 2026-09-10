import type { Challenge } from "@/features/auth/useChallenge";
import { useTranslation } from "react-i18next";

/**
 * Where the bot check is drawn, or nothing at all when the server has none configured.
 *
 * Deliberately not hidden behind a spinner while the site key is fetched: the widget is a
 * third-party iframe that appears when it appears, and a placeholder the same size would
 * only make the form jump twice instead of once.
 */
export function ChallengeField({ challenge }: { challenge: Challenge }) {
  const { t } = useTranslation();

  if (!challenge.required) return null;

  return (
    <div>
      {/* Keyed, so a change of action unmounts the node the last widget was drawn into.
          Turnstile will otherwise keep a widget that is already standing in a container
          and go on reporting the token it solved for the previous form. */}
      <div key={challenge.action} ref={challenge.container} />
      {challenge.failed && (
        <p className="mt-2 text-[11.5px] leading-[1.5] text-accent">
          {t("auth.challengeUnavailable")}
        </p>
      )}
    </div>
  );
}
