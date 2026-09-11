import { AppShell } from "@/components/layout/AppShell";
import { BackBar } from "@/components/layout/BackBar";
import { Card, LinkRow, Row, SectionTitle } from "@/components/rows";
import { Toggle, buttonClassName } from "@/components/ui";
import { CURRENCIES, currencyChipLabel } from "@/domain/currency";
import { formatRelativeTime } from "@/domain/relativeTime";
import { DiagnosticsSettings } from "@/features/diagnostics";
import { useSettingsLogic, useStorageEstimate } from "@/features/settings/useSettingsLogic";
import { cn } from "@/lib/utils";
import type { AppLanguage } from "@/local/settings";
import { Link } from "@tanstack/react-router";
import {
  Banknote,
  Bell,
  Check,
  ChevronDown,
  CloudOff,
  HardDrive,
  Info,
  Languages,
  RefreshCw,
  Scale,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Screen 20a — Settings.
 *
 * Six rows in two cards, no Save button, and one sentence at the top doing the work that
 * would otherwise be a warning on every row: the collection follows you everywhere, and
 * these do not. Naming what *does* sync is what makes the omission legible.
 *
 * It works with no account at all (20g), because the whole app does — only the sync row
 * changes, and it becomes the invitation rather than disappearing.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const logic = useSettingsLogic();
  const values = logic.values;
  const storage = useStorageEstimate();

  return (
    <AppShell stats={logic.stats} phoneBottom="none">
      <BackBar to="/you" label={t("you.title")} />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-6 pb-10 sm:px-8 sm:pt-8">
        <div className="max-w-[720px]">
          <h1 className="font-serif text-[26px] leading-[1.08] sm:text-[32px] sm:leading-[1.05]">
            {t("nav.settings")}
          </h1>
          <p className="mt-2 max-w-[560px] text-[13.5px] leading-relaxed text-pretty text-ink-muted">
            {logic.signedIn ? t("settings.scope.signedIn") : t("settings.scope.anonymous")}
          </p>

          <SectionTitle>{t("settings.section.languageCurrency")}</SectionTitle>
          <Card>
            <SettingRow
              icon={<Languages size={16} strokeWidth={1.75} aria-hidden />}
              title={t("settings.appLanguage.title")}
              body={
                values === undefined
                  ? undefined
                  : values.appLanguage === "system"
                    ? t("settings.appLanguage.following", {
                        language: t(
                          `settings.language.${i18n.language.startsWith("en") ? "en" : "de"}`,
                        ),
                      })
                    : t("settings.appLanguage.chosen")
              }
              state={logic.state("appLanguage")}
              failure={t("settings.appLanguage.failed", {
                value: t(`settings.appLanguage.option.${values?.appLanguage ?? "system"}`),
              })}
              onRetry={logic.retry}
              control={
                <Picker
                  label={t("settings.appLanguage.title")}
                  value={values?.appLanguage}
                  onChange={(next) => logic.setAppLanguage(next as AppLanguage)}
                  options={(["system", "de", "en"] as const).map((value) => ({
                    value,
                    label: t(`settings.appLanguage.option.${value}`),
                  }))}
                />
              }
            />
            {/* Its own row rather than folded into the one above: German is the binding
                original of these documents and English a translation of it, so which one
                you read is a different question from which language the buttons are in. */}
            <SettingRow
              icon={<Scale size={16} strokeWidth={1.75} aria-hidden />}
              title={t("settings.documents.title")}
              body={values === undefined ? undefined : t("settings.documents.body")}
              state={logic.state("documentLanguage")}
              failure={t("settings.documents.failed", {
                value: t(`settings.language.${values?.documentLanguage ?? "de"}`),
              })}
              onRetry={logic.retry}
              control={
                <Picker
                  label={t("settings.documents.title")}
                  value={values?.documentLanguage}
                  onChange={(next) => logic.setDocumentLanguage(next === "en" ? "en" : "de")}
                  options={(["de", "en"] as const).map((value) => ({
                    value,
                    label: t(`settings.language.${value}`),
                  }))}
                />
              }
            />
            {/* "For new copies" lives in the title, not the help text, so the scope survives
                being skim-read (20d). Nothing on this row can change a copy already saved,
                and the count says how many that is. */}
            <SettingRow
              icon={<Banknote size={16} strokeWidth={1.75} aria-hidden />}
              title={t("settings.currency.title")}
              body={
                values === undefined
                  ? undefined
                  : t("settings.currency.body", { count: logic.copyCount })
              }
              state={logic.state("currency")}
              failure={t("settings.currency.failed", { value: values?.currency ?? "EUR" })}
              onRetry={logic.retry}
              control={
                <Picker
                  label={t("settings.currency.title")}
                  value={values?.currency}
                  onChange={(next) => logic.setCurrency(next as (typeof CURRENCIES)[number])}
                  options={CURRENCIES.map((code) => ({
                    value: code,
                    label: currencyChipLabel(code),
                  }))}
                />
              }
            />
          </Card>

          {/* 22a: only with an account. What may reach you outside the app follows the
              account, so a signed-out person has no address to reach and nothing to set --
              a greyed row here would only advertise that an account exists. */}
          {logic.signedIn && (
            <>
              <SectionTitle>{t("settings.section.notifications")}</SectionTitle>
              <Card>
                <LinkRow
                  to="/settings/notifications"
                  icon={<Bell size={16} strokeWidth={1.75} aria-hidden />}
                  title={t("notifications.title")}
                  body={t("notifications.rowBody")}
                />
              </Card>
            </>
          )}

          <DiagnosticsSettings />

          <SectionTitle>{t("settings.section.storageSync")}</SectionTitle>
          <Card>
            {/* 20g: with no account there is nothing to sync to, so the toggle becomes the
                invitation rather than a control that would do nothing. */}
            {logic.signedIn ? (
              <SettingRow
                icon={<RefreshCw size={16} strokeWidth={1.75} aria-hidden />}
                title={t("settings.sync.title")}
                body={
                  values === undefined
                    ? undefined
                    : values.lastSyncedAt === null
                      ? t("settings.sync.never")
                      : t("settings.sync.lastSynced", {
                          when: formatRelativeTime(values.lastSyncedAt, i18n.language),
                        })
                }
                state={logic.state("sync")}
                failure={t("settings.sync.failed")}
                onRetry={logic.retry}
                control={
                  <Toggle
                    checked={values?.syncEnabled ?? true}
                    onChange={logic.setSyncEnabled}
                    label={t("settings.sync.title")}
                  />
                }
              />
            ) : (
              <Row
                icon={<CloudOff size={16} strokeWidth={1.75} aria-hidden />}
                title={t("settings.sync.title")}
                body={t("settings.sync.anonymous", { count: logic.copyCount })}
                trailing={
                  <Link
                    to="/signin"
                    className={cn(buttonClassName("secondary"), "h-[30px] rounded-md px-3 text-xs")}
                  >
                    {t("settings.sync.signIn")}
                  </Link>
                }
              />
            )}
            <Row
              icon={<HardDrive size={16} strokeWidth={1.75} aria-hidden />}
              title={t("settings.local.title")}
              body={
                storage === null
                  ? t("settings.local.body")
                  : `${t("settings.local.body")} · ${formatBytes(storage, i18n.language)}`
              }
              trailing={
                // Reading is the local store, so this cannot be turned off without breaking
                // the app. Shown on and explained rather than hidden.
                <Toggle
                  checked
                  label={t("settings.local.title")}
                  disabledReason={t("settings.local.always")}
                />
              }
            />
            {/* 20c: three states, and the resting one has no control at all — a disabled
                button that clears nothing is exactly what this avoids. */}
            <SettingRow
              icon={<Search size={16} strokeWidth={1.75} aria-hidden />}
              title={t("settings.searches.title")}
              body={
                values === undefined
                  ? undefined
                  : values.recentSearches === 0
                    ? t("settings.searches.empty")
                    : t("settings.searches.body", { count: values.recentSearches })
              }
              state={logic.state("searches")}
              acknowledgement={
                logic.cleared === null
                  ? undefined
                  : t("settings.searches.cleared", { count: logic.cleared })
              }
              failure={t("settings.searches.failed")}
              onRetry={logic.retry}
              dimmed={values !== undefined && values.recentSearches === 0 && logic.cleared === null}
              control={
                values !== undefined && values.recentSearches > 0 ? (
                  <button
                    type="button"
                    onClick={logic.clearSearches}
                    disabled={logic.clearing}
                    className="flex h-[30px] flex-none items-center rounded-md border border-accent/35 px-3 text-xs font-semibold text-accent-strong transition-colors duration-(--mc-quick) hover:bg-accent/5"
                  >
                    {t("settings.searches.clear")}
                  </button>
                ) : undefined
              }
            />
          </Card>

          <p className="mt-3.5 flex items-start gap-2 px-0.5 text-[11.5px] leading-relaxed text-ink-subtle">
            <Info size={13} strokeWidth={1.75} aria-hidden className="mt-0.5 flex-none" />
            <span>
              {t("settings.footnote.saves")}{" "}
              <Link to="/account" className="border-b border-line text-ink-muted no-underline">
                {t("account.title")}
              </Link>
              .
            </span>
          </p>
        </div>
      </div>
    </AppShell>
  );
}

interface SettingRowProps {
  readonly icon: ReactNode;
  /** Undefined while the value is still being read — the title stays, this shimmers. */
  readonly body: string | undefined;
  readonly title: string;
  readonly control?: ReactNode;
  readonly state: "idle" | "saved" | "failed";
  readonly failure: string;
  readonly onRetry: () => void;
  /** Overrides the "Saved" wording — the searches row says how many went instead. */
  readonly acknowledgement?: string;
  readonly dimmed?: boolean;
}

/**
 * One preference, in whichever of the three states it is in (20b).
 *
 * Loading keeps the title and the icon and shimmers only the value, because only the value
 * is unknown — a row that redrew wholesale would snap a moment after mount. A failure keeps
 * the *stored* value in the control and says so underneath: the setting that is actually in
 * force is the one worth naming.
 */
function SettingRow({
  icon,
  title,
  body,
  control,
  state,
  failure,
  onRetry,
  acknowledgement,
  dimmed,
}: SettingRowProps) {
  const { t } = useTranslation();
  const loading = body === undefined;

  return (
    <div className="border-b border-line last:border-b-0">
      {/* 24k: label and explanation first, control on its own line under 640px. */}
      <div className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex-none",
              dimmed || loading ? "text-ink-subtle/60" : "text-ink-subtle",
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div
              className={cn(
                "text-[13px] font-semibold text-pretty",
                (dimmed || loading) && "text-ink-muted",
              )}
            >
              {title}
            </div>
            {loading ? (
              <div className="mt-1.5 h-[9px] w-[190px] animate-pulse rounded-[3px] bg-ink/10" />
            ) : (
              <div
                className={cn(
                  "text-[11.5px] max-sm:leading-[1.5] sm:truncate",
                  dimmed ? "text-ink-subtle" : "text-ink-muted",
                )}
              >
                {body}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2.5 max-sm:justify-between">
          {state === "saved" && (
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-accent">
              <Check size={12} strokeWidth={2.25} aria-hidden />
              {acknowledgement ?? t("settings.saved")}
            </span>
          )}
          {loading ? (
            <div className="h-[30px] w-[104px] animate-pulse rounded-md bg-ink/10" />
          ) : (
            control
          )}
        </div>
      </div>
      {state === "failed" && (
        <div className="flex items-center justify-between gap-3.5 border-t border-accent/20 bg-accent/5 px-4 py-2.5">
          <p className="text-[11.5px] leading-snug text-pretty text-accent-strong">{failure}</p>
          <button
            type="button"
            onClick={onRetry}
            className="h-7 flex-none rounded-md border border-accent/35 bg-surface px-2.5 text-[11.5px] font-semibold text-accent-strong"
          >
            {t("settings.tryAgain")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The compact chip-with-a-chevron the deck draws, over a real `<select>`.
 *
 * A native select rather than a custom menu: it is one of the few controls the platform
 * already does better than anything hand-built — keyboard, screen readers, and on a phone
 * the system picker — and nothing in the design needs behaviour a select cannot give.
 */
function Picker({
  label,
  value,
  onChange,
  options,
}: {
  readonly label: string;
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}) {
  const current = options.find((option) => option.value === value);
  return (
    <div className="relative flex h-[30px] flex-none items-center gap-1.5 rounded-md border border-ink/15 bg-surface pl-3 pr-2 text-xs font-semibold text-ink-muted">
      {current?.label ?? options[0]?.label}
      <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="text-ink-subtle" />
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Whole megabytes: the row is saying "this is not nothing", not accounting. */
function formatBytes(bytes: number, language: string): string {
  const megabytes = bytes / 1_000_000;
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: megabytes < 10 ? 1 : 0 }).format(megabytes)} MB`;
}
