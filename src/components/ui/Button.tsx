import type { UserActionName } from "@/diagnostics/userActions";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary";

/**
 * Shared button styling, exported separately so links that look like buttons can reuse it.
 * Wrapping an anchor in a button element would be invalid HTML and unfocusable.
 */
export function buttonClassName(variant: ButtonVariant = "primary", className?: string): string {
  return cn(
    // Tailwind v4's preflight resets buttons to cursor:default; the base layer in
    // styles.css restores the pointer, and this keeps anchors consistent with it.
    "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors duration-(--mc-quick) disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-ink text-paper hover:bg-black",
    variant === "secondary" && "border border-line bg-surface text-ink hover:bg-canvas",
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly loading?: boolean;
  readonly variant?: ButtonVariant;
  /**
   * Times a press of this button as a Faro user action, grouping the requests it sets off.
   * Only the name is sent, never the label or anything typed; see `diagnostics/userActions`.
   */
  readonly action?: UserActionName;
  readonly children: ReactNode;
}

/**
 * Every control that fires a request goes through here: `loading` both disables the
 * button and shows the spinner, so no caller hand-rolls a busy boolean.
 */
export function Button({
  loading = false,
  variant = "primary",
  className,
  disabled,
  action,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled === true || loading}
      className={buttonClassName(variant, className)}
      data-faro-user-action-name={action}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
