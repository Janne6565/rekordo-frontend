import { Button, buttonClassName } from "@/components/ui";
import { AuthBrandPanel } from "@/features/auth/AuthBrandPanel";
import { ChallengeField } from "@/features/auth/ChallengeField";
import { PasswordField } from "@/features/auth/PasswordField";
import { ProviderIcon } from "@/features/auth/ProviderIcon";
import type { AuthError } from "@/features/auth/useAuthLogic";
import { useAuthLogic } from "@/features/auth/useAuthLogic";
import { LegalLinksRow, LegalTextLink } from "@/features/legal/LegalLinks";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, Disc3, HardDrive, Mail, User } from "lucide-react";
import { useEffect, useId } from "react";
import { Trans, useTranslation } from "react-i18next";

const providerButtonClass =
  "flex h-11 flex-1 items-center justify-center gap-2 rounded-[9px] border border-line bg-surface text-[13px] font-semibold";

/** Screens 4c and 4d: a dark brand panel beside the form, refined in the sign-in turn 2. */
export function SignInPage() {
  const { t } = useTranslation();
  const logic = useAuthLogic();
  const navigate = useNavigate();
  /* The failure the server sends people back here with. Nothing renders it yet. */
  const { oauthError } = useSearch({ strict: false }) as { oauthError?: string };

  /*
   * Somebody who is already signed in has nothing to do on this page, so it hands them
   * their shelf instead — the same place signing in ends up.
   *
   * Two things it deliberately does not do. It waits for `signedIn` rather than acting
   * on "not anonymous": the session is restored from the refresh cookie after the first
   * paint, and status is `unknown` until then. And it leaves a failed provider sign-in
   * alone, because that lands here to be told about — with a session still restorable
   * from an earlier one, it would otherwise be swept off the screen.
   *
   * It no longer stands aside for a pending first sync (29). That question is now asked
   * over the library, above the router, so sending somebody there is what *shows* it —
   * keeping them on this page would leave the dialogue floating over a sign-in form they
   * have already used.
   *
   * `replace` so the back gesture returns to wherever they were, not to a page that
   * bounces them forward again.
   */
  const signedInAlready = logic.auth.status === "signedIn";
  useEffect(() => {
    if (signedInAlready && oauthError === undefined) void navigate({ to: "/", replace: true });
  }, [signedInAlready, oauthError, navigate]);

  const registering = logic.mode === "REGISTER";
  /*
   * On register the one consent tick gates the provider buttons too. A provider sign-up
   * records the same consent a password sign-up does, and a tick that is already on the
   * screen says it where a paragraph beside the buttons only described it.
   */
  const providersLocked = registering && !logic.consented;

  return (
    <div className="flex min-h-full bg-paper">
      <AuthBrandPanel mode={logic.mode} />

      <main className="flex flex-1 items-start justify-center px-4 pt-7 pb-10 sm:items-center sm:px-6 sm:py-10">
        <div className="w-full max-w-[380px]">
          {/* The way back and the mode switch share the top row. At the foot, the switch
              sat below a finished form, so somebody on the wrong mode found out last. */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink"
            >
              <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
              {t("common.back")}
            </Link>
            <p className="text-right text-[12.5px] text-ink-muted">
              {registering ? t("auth.haveAccountPrefix") : t("auth.needAccountPrefix")}{" "}
              <button
                type="button"
                onClick={() => logic.setMode(registering ? "SIGN_IN" : "REGISTER")}
                className="font-semibold text-accent"
              >
                {registering ? t("auth.signIn") : t("auth.create")}
              </button>
            </p>
          </div>
          {/*
           * 24i: the brand panel beside this card is gone under 768px and cannot be
           * replaced — so the wordmark carries it here, as one line above the heading.
           * Without it the sign-in screen on a phone belongs to no product in particular.
           */}
          <div className="mb-3 flex items-center gap-2 text-ink-muted md:hidden">
            <Disc3 size={17} strokeWidth={1.6} aria-hidden />
            <span className="font-serif text-[15px]">{t("app.name")}</span>
          </div>
          <h1 className="font-serif text-[26px] leading-[1.12] sm:text-[30px] sm:leading-[1.1]">
            {registering ? t("auth.createTitle") : t("auth.signInTitle")}
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-muted">
            {registering ? t("auth.createLede") : t("auth.signInLede")}
          </p>

          <form
            className="mt-6 flex flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              logic.submit();
            }}
          >
            {registering && (
              <TextField
                label={t("auth.name")}
                icon={<User size={16} strokeWidth={1.75} aria-hidden />}
                value={logic.displayName}
                onChange={logic.setDisplayName}
                autoComplete="name"
                placeholder={t("auth.namePlaceholder")}
              />
            )}

            <TextField
              label={t("auth.email")}
              icon={<Mail size={16} strokeWidth={1.75} aria-hidden />}
              value={logic.email}
              onChange={logic.setEmail}
              type="email"
              autoComplete="email"
              placeholder={t("auth.emailPlaceholder")}
            />

            {/* The reset-needs-confirmed sentence moved to the Forgot screen (21f), which
                is where the question it answers is actually asked. */}
            <PasswordField
              label={t("auth.password")}
              value={logic.password}
              onChange={logic.setPassword}
              autoComplete={registering ? "new-password" : "current-password"}
              placeholder={
                registering ? t("auth.newPasswordPlaceholder") : t("auth.passwordPlaceholder")
              }
              showStrength={registering}
              trailing={
                registering ? undefined : (
                  <Link to="/forgot" className="text-[11.5px] font-medium text-accent">
                    {t("auth.forgot")}
                  </Link>
                )
              }
            />

            {registering ? (
              <Checkbox checked={logic.consented} onChange={logic.setConsented}>
                <Trans
                  i18nKey="auth.agreeTerms"
                  components={{
                    terms: <LegalTextLink doc="nutzungsbedingungen" />,
                    privacy: <LegalTextLink doc="datenschutz" />,
                  }}
                />
              </Checkbox>
            ) : (
              <Checkbox checked={logic.rememberMe} onChange={logic.setRememberMe}>
                {t("auth.rememberMe")}
              </Checkbox>
            )}

            {/* Above the errors and below the ticks: it is the last thing asked before the
                button, and a check that appeared under the button would be missed. */}
            <ChallengeField challenge={logic.challenge} />

            {logic.failed.length > 0 && <AuthErrorMessages errors={logic.failed} />}

            <Button
              type="submit"
              action={registering ? "auth.sign-up" : "auth.sign-in"}
              loading={logic.submitting}
              disabled={!logic.canSubmit}
              className="h-[46px] rounded-[9px]"
            >
              {registering ? t("auth.create") : t("auth.signIn")}
            </Button>
          </form>

          {logic.availableProviders.length > 0 && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-line" />
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                  {t("auth.or")}
                </span>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="flex gap-2.5">
                {logic.availableProviders.map((provider) =>
                  providersLocked ? (
                    <button
                      key={provider.id}
                      type="button"
                      disabled
                      className={`${providerButtonClass} cursor-not-allowed opacity-45`}
                    >
                      <ProviderIcon providerId={provider.id} />
                      {provider.displayName}
                    </button>
                  ) : (
                    <a
                      key={provider.id}
                      // A full navigation, never fetch: the provider answers with a redirect
                      // the browser has to follow itself.
                      href={`/api/v1/auth/oauth/${provider.id}/authorize`}
                      className={`${providerButtonClass} hover:bg-canvas`}
                    >
                      <ProviderIcon providerId={provider.id} />
                      {provider.displayName}
                    </a>
                  ),
                )}
              </div>
              {providersLocked && (
                <p className="mt-1.5 text-[11px] text-ink-subtle">
                  {t("auth.providerNeedsConsent")}
                </p>
              )}
            </>
          )}

          {/* The no-account path is a real control, not a footnote: it sits with the other
              ways in, at the same size as the OAuth buttons. The app is fully usable without
              an account, and burying that would be a lie about what signing in is for. The
              darker border is the one thing that separates it from a provider button — it
              is a destination, not a handoff. Its note and the legal links share one row. */}
          <div className="mt-5 border-t border-line pt-4">
            <Link
              to="/"
              className={buttonClassName(
                "secondary",
                "h-11 w-full rounded-[9px] border-ink/40 text-[13.5px] hover:border-ink",
              )}
            >
              <HardDrive size={16} strokeWidth={1.75} className="text-ink-subtle" aria-hidden />
              {t("auth.continueWithout")}
            </Link>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-[11.5px] text-ink-subtle">{t("auth.continueWithoutBody")}</p>
              <LegalLinksRow />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Every reason the submit was refused, one line each.
 *
 * A form that reports only the first problem makes someone discover the rest one round
 * trip at a time, which is the same conversation the old single "something went wrong"
 * was having — just slower.
 */
function AuthErrorMessages({ errors }: { readonly errors: readonly AuthError[] }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col gap-1">
      {errors.map((error) => (
        <p key={error} className="text-sm text-accent">
          {t(`auth.error.${error}` as const)}
        </p>
      ))}
    </div>
  );
}

interface TextFieldProps {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly autoComplete: string;
  /** An example of the shape wanted, never a restatement of the label. */
  readonly placeholder?: string;
}

export function TextField({
  label,
  icon,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: TextFieldProps) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle"
      >
        {label}
      </label>
      <div className="mt-1.5 flex h-[46px] items-center gap-2.5 rounded-[9px] border border-line bg-surface px-3.5 focus-within:border-ink">
        <span className="flex-none text-ink-subtle">{icon}</span>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-subtle"
        />
      </div>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-[18px] w-[18px] flex-none accent-ink"
      />
      <label htmlFor={id} className="text-[12.5px] leading-[1.5] text-ink-muted">
        {children}
      </label>
    </div>
  );
}
