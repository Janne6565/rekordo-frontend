import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

function Group({ heading, children }: { readonly heading: string; readonly children: ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="font-mono text-[10px] tracking-[0.13em] text-ink-subtle uppercase">
        {heading}
      </div>
      <ul className="mt-2 border-t border-line">{children}</ul>
    </div>
  );
}

function Line({ children }: { readonly children: ReactNode }) {
  return (
    <li className="border-b border-line py-[9px] text-[12.5px] leading-[1.55] text-pretty">
      {children}
    </li>
  );
}

/**
 * The full disclosure, split by level.
 *
 * Three headings rather than one list, because the two levels genuinely differ and a
 * single list would have to hedge every line with "depending on your choice". The shared
 * base is stated once, then what Full adds on top, then what is true either way.
 *
 * The two corrections that matter are in "Either way": Grafana Frontend Observability does
 * not store IP addresses, and the session identifier is random and dies with the tab.
 * An earlier draft claimed the IP was collected, which overstated the ask and would have
 * been wrong in the privacy policy it points at.
 */
export function ConsentDetail({ onBack }: { readonly onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="font-serif text-[21px] leading-[1.2]">{t("diagnostics.detail.title")}</div>
      <p className="mt-1 text-[12.5px] text-ink-muted">{t("diagnostics.detail.lead")}</p>

      <Group heading={t("diagnostics.detail.anonymousHeading")}>
        <Line>{t("diagnostics.detail.anonymous1")}</Line>
        <Line>{t("diagnostics.detail.anonymous2")}</Line>
        <Line>{t("diagnostics.detail.anonymous3")}</Line>
        <Line>{t("diagnostics.detail.anonymous4")}</Line>
      </Group>

      <Group heading={t("diagnostics.detail.fullHeading")}>
        <Line>{t("diagnostics.detail.full1")}</Line>
        <Line>{t("diagnostics.detail.full2")}</Line>
        <Line>{t("diagnostics.detail.full3")}</Line>
      </Group>

      <Group heading={t("diagnostics.detail.eitherHeading")}>
        <Line>{t("diagnostics.detail.either1")}</Line>
        <Line>{t("diagnostics.detail.either2")}</Line>
        <Line>{t("diagnostics.detail.either3")}</Line>
      </Group>

      <button
        type="button"
        onClick={onBack}
        className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:text-accent-hover"
      >
        <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        {t("diagnostics.detail.back")}
      </button>
    </div>
  );
}
