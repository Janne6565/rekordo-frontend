import { cn } from "@/lib/utils";
import { passwordStrength } from "@janne6565/rekordo-shared";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

interface PasswordFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoComplete: string;
  /** Registration shows the meter; signing in does not — the password already exists. */
  readonly showStrength?: boolean;
  readonly trailing?: React.ReactNode;
  readonly placeholder?: string;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  showStrength = false,
  trailing,
  placeholder,
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle"
        >
          {label}
        </label>
        {/* The length rule rides in the label row, where it costs no height. The long
            version is still what a too-short submit is told. */}
        {trailing ??
          (showStrength && (
            <span className="text-[11px] text-ink-subtle">{t("auth.passwordHintShort")}</span>
          ))}
      </div>

      <div className="mt-1.5 flex h-[46px] items-center gap-2.5 rounded-[9px] border border-line bg-surface px-3.5 focus-within:border-ink">
        <Lock size={16} strokeWidth={1.75} className="flex-none text-ink-subtle" aria-hidden />
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-subtle"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          // Labelled by what pressing it does, not by the current state, which is what a
          // screen reader user needs to decide whether to press it.
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          className="flex-none text-ink-subtle hover:text-ink"
        >
          {visible ? (
            <EyeOff size={16} strokeWidth={1.75} aria-hidden />
          ) : (
            <Eye size={16} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>

      {showStrength && (
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {[1, 2, 3].map((bar) => (
            <div
              key={bar}
              className={cn("h-[3px] flex-1 rounded-sm", bar <= strength ? "bg-accent" : "bg-line")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
