import { forgotPassword } from "@/api/generated/auth/auth";
import { Button } from "@/components/ui";
import { AuthBrandPanel } from "@/features/auth/AuthBrandPanel";
import { ChallengeField } from "@/features/auth/ChallengeField";
import { TextField } from "@/features/auth/SignInPage";
import { useChallenge } from "@/features/auth/useChallenge";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  /*
   * This endpoint sends mail to an address the caller typed, which is the one here worth a
   * bot check most: unprotected it is a way to post somebody else's inbox a reset link
   * repeatedly from any script.
   */
  const challenge = useChallenge("forgot-password");

  const request = useMutation({
    /*
     * Errors are swallowed on purpose: a failure that looked different for a registered
     * address would turn this screen into a way to find out who has an account.
     *
     * A refused bot check is the one exception, and has to be. It says nothing about the
     * address -- the endpoint answers the same for one with an account and one without --
     * but swallowing it would show somebody "a link is on its way" when no mail was sent,
     * and they would sit waiting for it.
     */
    mutationFn: async () =>
      forgotPassword({ email: email.trim(), turnstileToken: challenge.token }).catch(
        (error: unknown) => {
          if ((error as { response?: { status?: number } }).response?.status === 403) throw error;
          return undefined;
        },
      ),
    // A token is spent by the attempt whether or not it was accepted.
    onSettled: () => challenge.reset(),
  });

  return (
    <div className="flex min-h-full bg-paper">
      <AuthBrandPanel mode="SIGN_IN" />
      <main className="flex flex-1 items-start justify-center px-4 pt-7 pb-10 sm:items-center sm:px-6 sm:py-12">
        <div className="w-full max-w-[380px]">
          <h1 className="font-serif text-[32px] leading-[1.1]">{t("auth.forgotTitle")}</h1>

          {request.isSuccess ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{t("auth.forgotSent")}</p>
              <Link to="/signin" className="mt-6 block text-[13px] text-accent">
                {t("auth.backToSignIn")}
              </Link>
            </>
          ) : (
            <form
              className="mt-6 flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                request.mutate();
              }}
            >
              <p className="text-[13.5px] text-ink-muted">{t("auth.forgotLede")}</p>
              <TextField
                label={t("auth.email")}
                icon={<Mail size={16} strokeWidth={1.75} aria-hidden />}
                value={email}
                onChange={setEmail}
                type="email"
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
              />
              {/* 21f: the one place the cost of an unconfirmed address is stated. It sat on
                  the sign-in form until turn 2, answering a question nobody has until they
                  come here -- and the reset endpoint itself has to stay silent, so it can
                  never be the thing that explains. */}
              <p className="-mt-1 text-[11.5px] leading-[1.5] text-ink-subtle">
                {t("auth.resetNeedsConfirmed")}
              </p>
              <ChallengeField challenge={challenge} />
              {request.isError && (
                <p role="alert" className="text-sm text-accent">
                  {t("auth.error.challengeFailed")}
                </p>
              )}
              <Button
                type="submit"
                loading={request.isPending}
                disabled={email.trim().length === 0 || !challenge.satisfied}
                className="h-[46px] rounded-[9px]"
              >
                {t("auth.forgotSubmit")}
              </Button>
              <Link to="/signin" className="text-[13px] text-ink-subtle">
                {t("auth.backToSignIn")}
              </Link>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
