import {
  confirmEmail,
  requestEmailConfirmation,
  resendEmailConfirmation,
} from "@/api/generated/auth/auth";
import { Button, buttonClassName } from "@/components/ui";
import { ChallengeField } from "@/features/auth/ChallengeField";
import { looksTruncated, maskAddress } from "@/features/auth/confirmToken";
import { useChallenge } from "@/features/auth/useChallenge";
import { Route } from "@/routes/confirm.$token";
import { accountChanged } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Screen 21d — the confirm page, on its own rather than in the app shell.
 *
 * The link may open in a browser that has never signed in, on a work laptop, or in a mail
 * client's preview pane. So there is no collection, no name and no full address here: the
 * version a stranger sees is the version everyone sees, and the owner gets one different
 * button because the session is there, not because the page changed.
 *
 * The token is redeemed on mount, once. React 19 mounts effects twice in development, and a
 * one-time token spent by the first run would report a dead link on a confirmation that had
 * in fact just worked.
 */
export function ConfirmEmailPage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const dispatch = useAppDispatch();
  const signedIn = useAppSelector((state) => state.auth.status === "signedIn");
  const truncated = looksTruncated(token);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const attempted = useRef(false);

  const confirm = useMutation({
    mutationFn: async () => confirmEmail({ token }),
    onSuccess: (user) => {
      if (user.email !== undefined) setConfirmed(user.email);
      // Only this browser's own account changed; a stranger's session is not ours to touch.
      if (signedIn) dispatch(accountChanged(user));
    },
  });

  const { mutate } = confirm;
  useEffect(() => {
    if (truncated || attempted.current) return;
    attempted.current = true;
    mutate();
  }, [truncated, mutate]);

  const state = truncated
    ? "truncated"
    : confirm.isError
      ? "dead"
      : confirmed !== null
        ? "done"
        : "pending";

  return (
    <div className="flex min-h-full items-start justify-center bg-paper px-4 pt-8 pb-10 sm:items-center sm:px-6 sm:py-16">
      <div className="w-full max-w-[440px]">
        <div className="font-serif text-[19px] leading-none">Rekordo</div>
        <div className="mt-5 h-px bg-line" />

        <h1 className="mt-8 font-serif text-[30px] leading-[1.15]">
          {t(`auth.confirmPage.${state}.title`)}
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-ink-muted">
          {state === "done"
            ? t("auth.confirmPage.done.body", { email: maskAddress(confirmed ?? "") })
            : t(`auth.confirmPage.${state}.body`)}
        </p>

        {state === "truncated" && (
          <p className="mt-5 rounded-lg bg-canvas px-4 py-3 font-mono text-[12px] leading-[1.7] break-all text-ink-subtle">
            {t("auth.confirmPage.truncated.exampleHead")}
            <span className="font-semibold text-ink">
              {t("auth.confirmPage.truncated.exampleTail")}
            </span>
            <span className="mt-1 block text-ink-subtle">
              {t("auth.confirmPage.truncated.exampleNote")}
            </span>
          </p>
        )}

        {state === "done" && (
          <div className="mt-7 flex items-center gap-4">
            <Link to="/" className={buttonClassName("primary", "h-[46px] rounded-[9px] px-5")}>
              {signedIn
                ? t("auth.confirmPage.done.backToLibrary")
                : t("auth.confirmPage.done.open")}
            </Link>
            <button
              type="button"
              onClick={() => window.close()}
              className="text-[13px] text-ink-muted hover:text-ink"
            >
              {t("auth.confirmPage.done.closeTab")}
            </button>
          </div>
        )}

        {state === "dead" &&
          /*
           * Signed in, the address is already known and one button is enough. Signed out
           * this asks for it — the same form as /forgot, and silent for the same reason:
           * a different answer for a registered address would say who has an account.
           */
          (signedIn ? <ResendForOwner /> : <AskForAnother />)}
      </div>
    </div>
  );
}

/** The one extra button the owner gets, because the session is there. */
function ResendForOwner() {
  const { t } = useTranslation();
  const resend = useMutation({ mutationFn: async () => resendEmailConfirmation() });

  return (
    <Button
      onClick={() => resend.mutate()}
      loading={resend.isPending}
      disabled={resend.isSuccess}
      className="mt-7 h-[46px] rounded-[9px] px-5"
    >
      {resend.isSuccess ? t("auth.confirmPage.dead.sent") : t("auth.confirmPage.dead.sendMine")}
    </Button>
  );
}

/**
 * The signed-out half of the dead state: an address, and a link on its way if it has an
 * account. It never says whether it did — a different answer here would tell a stranger
 * who is registered, which is the same rule the forgotten-password form lives under.
 */
function AskForAnother() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  // Mail to an address the caller typed, from a page nobody has to be signed in to reach.
  const challenge = useChallenge("request-email-confirmation");
  const send = useMutation({
    mutationFn: async () => requestEmailConfirmation({ email, turnstileToken: challenge.token }),
    // A token is spent by the attempt whether or not it was accepted.
    onSettled: () => challenge.reset(),
  });

  if (send.isSuccess) {
    return (
      <p className="mt-7 text-[13px] text-ink-muted">{t("auth.confirmPage.dead.sentAnonymous")}</p>
    );
  }

  return (
    <form
      className="mt-7"
      onSubmit={(event) => {
        event.preventDefault();
        send.mutate();
      }}
    >
      <p className="mb-3 text-[12.5px] text-ink-subtle">{t("auth.confirmPage.dead.hint")}</p>
      <div className="mb-3">
        <ChallengeField challenge={challenge} />
      </div>
      {send.isError && (
        <p role="alert" className="mb-3 text-sm text-accent">
          {t("auth.error.challengeFailed")}
        </p>
      )}
      <div className="flex items-center gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("auth.confirmPage.dead.placeholder")}
          className="h-[46px] min-w-0 flex-1 rounded-[9px] border border-line bg-surface px-3.5 text-[14px] outline-none placeholder:text-ink-subtle"
        />
        <Button
          type="submit"
          loading={send.isPending}
          disabled={!challenge.satisfied}
          className="h-[46px] rounded-[9px] px-5"
        >
          {t("auth.confirmPage.dead.send")}
        </Button>
      </div>
    </form>
  );
}
