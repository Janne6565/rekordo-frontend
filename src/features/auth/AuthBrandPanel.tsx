import { Disc3, Heart, Layers, ScanBarcode } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AuthBrandPanelProps {
  readonly mode: "SIGN_IN" | "REGISTER";
  /** A sign-in foot line. Only loading 1b has one: who the shelf being fetched belongs to. */
  readonly footer?: string;
}

/** The dark half of screens 4c and 4d, and of loading 1b. */
export function AuthBrandPanel({ mode, footer }: AuthBrandPanelProps) {
  const { t } = useTranslation();
  const foot = mode === "REGISTER" ? t("authPanel.freeNote") : footer;

  return (
    <aside className="hidden w-[520px] flex-none flex-col justify-between bg-ink p-13 px-12 py-13 md:flex">
      <div>
        <div className="flex items-center gap-3 text-paper">
          <Disc3 size={22} strokeWidth={1.6} aria-hidden />
          <span className="font-serif text-[19px]">{t("app.name")}</span>
        </div>

        <h2 className="mt-14 font-serif text-[40px] leading-[1.15] text-white text-pretty">
          {mode === "SIGN_IN" ? t("authPanel.signInHeadline") : t("authPanel.registerHeadline")}
        </h2>

        {mode === "SIGN_IN" ? (
          <p className="mt-4 max-w-[360px] text-[14.5px] leading-[1.7] text-white/60 text-pretty">
            {t("authPanel.signInBody")}
          </p>
        ) : (
          <ul className="mt-8 flex flex-col gap-4">
            <Bullet icon={<ScanBarcode size={17} strokeWidth={1.75} aria-hidden />}>
              {t("authPanel.bulletScan")}
            </Bullet>
            <Bullet icon={<Layers size={17} strokeWidth={1.75} aria-hidden />}>
              {t("authPanel.bulletCopies")}
            </Bullet>
            <Bullet icon={<Heart size={17} strokeWidth={1.75} aria-hidden />}>
              {t("authPanel.bulletWishlist")}
            </Bullet>
          </ul>
        )}
      </div>

      {/* The sign-in form has no foot line. The four format thumbnails that used to sit
          here were decoration on a page whose whole job is to get out of the way, so the
          panel now ends with the copy. Register keeps its note, which says something, and
          loading 1b says whose shelf is on its way. */}
      {foot !== undefined && (
        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/35">{foot}</p>
      )}
    </aside>
  );
}

function Bullet({
  icon,
  children,
}: { readonly icon: React.ReactNode; readonly children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-sm text-white/70">
      <span className="text-white/50">{icon}</span>
      {children}
    </li>
  );
}
