import { setAccessToken } from "@/api/axios-instance";
import { resetPassword } from "@/api/generated/auth/auth";
import { Button } from "@/components/ui";
import { AuthBrandPanel } from "@/features/auth/AuthBrandPanel";
import { PasswordField } from "@/features/auth/PasswordField";
import { Route } from "@/routes/reset";
import { signedIn } from "@/store/authSlice";
import { useAppDispatch } from "@/store/hooks";
import { passwordLongEnough } from "@janne6565/rekordo-shared";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [password, setPassword] = useState("");
  const [tooShort, setTooShort] = useState(false);

  const reset = useMutation({
    mutationFn: async () => {
      if (!passwordLongEnough(password)) {
        setTooShort(true);
        return null;
      }
      return resetPassword({ token, password });
    },
    onSuccess: (session) => {
      if (session?.accessToken == null || session.user == null) return;
      // Redeeming signs you straight in — having just proved you control the address,
      // being asked to type the new password again would be pure ceremony.
      setAccessToken(session.accessToken);
      dispatch(signedIn({ user: session.user, firstSyncPending: false }));
      void navigate({ to: "/" });
    },
  });

  return (
    <div className="flex min-h-full bg-paper">
      <AuthBrandPanel mode="SIGN_IN" />
      <main className="flex flex-1 items-start justify-center px-4 pt-7 pb-10 sm:items-center sm:px-6 sm:py-12">
        <div className="w-full max-w-[380px]">
          <h1 className="font-serif text-[32px] leading-[1.1]">{t("auth.resetTitle")}</h1>

          {token === "" ? (
            <>
              <p className="mt-3 text-sm text-ink-muted">{t("auth.resetNoToken")}</p>
              <Link to="/forgot" className="mt-6 block text-[13px] text-accent">
                {t("auth.forgotSubmit")}
              </Link>
            </>
          ) : (
            <form
              className="mt-6 flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setTooShort(false);
                reset.mutate();
              }}
            >
              <PasswordField
                label={t("auth.newPassword")}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                placeholder={t("auth.newPasswordPlaceholder")}
                showStrength
              />
              {tooShort && <p className="text-sm text-accent">{t("auth.passwordHint")}</p>}
              {reset.isError && <p className="text-sm text-accent">{t("auth.resetInvalid")}</p>}
              <Button
                type="submit"
                loading={reset.isPending}
                disabled={password.length === 0}
                className="h-[46px] rounded-[9px]"
              >
                {t("auth.resetSubmit")}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
