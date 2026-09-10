import { challenge } from "@/api/generated/auth/auth";
import { loadTurnstile } from "@/features/auth/turnstile";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Which form the challenge stands in. Must match the wire names in the backend's
 * {@code ChallengeAction}: siteverify echoes the action back, and the server refuses a token
 * solved for a different one -- so a typo here is a form that can never be submitted.
 */
export type ChallengeAction =
  | "register"
  | "login"
  | "forgot-password"
  | "request-email-confirmation";

export interface Challenge {
  /** Bind to the element the widget is drawn into. */
  readonly container: (element: HTMLDivElement | null) => void;
  /** What the widget is currently solving for. Keys the element it is drawn into. */
  readonly action: ChallengeAction;
  /** Nothing is drawn when the server has no keys configured. */
  readonly required: boolean;
  /**
   * Whether the submit may go ahead. False while the site key is still being fetched, so a
   * form cannot race the answer and post without a token the server is about to demand.
   */
  readonly satisfied: boolean;
  readonly token: string | null;
  /** After every submit attempt: a token is spent whether or not the attempt succeeded. */
  readonly reset: () => void;
  /** The widget could not be loaded or drawn. Worth saying, because nothing is visible. */
  readonly failed: boolean;
}

/**
 * The bot check on one form.
 *
 * The site key is asked for rather than built in, because one frontend image is deployed to
 * both staging and production. The waiting that implies is the reason {@link Challenge.satisfied}
 * starts false: the old bug shape here is a form that posts before it knows a token is
 * needed and gets a 403 nobody can explain.
 */
export function useChallenge(action: ChallengeAction): Challenge {
  const { i18n } = useTranslation();
  const query = useQuery({
    queryKey: ["authChallenge"],
    queryFn: () => challenge(),
    // The site key changes when the deployment does, never while a tab is open.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  const siteKey = query.data?.siteKey ?? null;
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const widget = useRef<string | null>(null);

  /*
   * A callback ref rather than a plain one: the effect below has to run *after* the div
   * exists, and with a plain ref there is nothing to depend on that changes when it does.
   * Three of the four forms mount their widget conditionally, so the element genuinely
   * arrives later than the first render.
   */
  useEffect(() => {
    if (siteKey === null || element === null) return;

    let cancelled = false;
    let created: string | null = null;
    setFailed(false);

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        created =
          turnstile.render(element, {
            sitekey: siteKey,
            action,
            callback: (solved) => setToken(solved),
            // A token is good for five minutes. Somebody who fills the form slowly gets a
            // fresh challenge rather than a submit the server refuses as expired.
            "expired-callback": () => setToken(null),
            "error-callback": () => {
              setToken(null);
              setFailed(true);
            },
            theme: "light",
            size: "flexible",
            language: i18n.language,
          }) ?? null;
        widget.current = created;
        if (created === null) setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (created !== null) window.turnstile?.remove(created);
      widget.current = null;
      setToken(null);
    };
    /*
     * `element` is keyed by action upstream, so switching between sign-in and sign-up
     * arrives here as a genuinely new node. That is not belt and braces: rendering into a
     * container that still holds a solved widget makes Turnstile keep the old one, callback
     * and all -- so the form looked solved while the token it held had been minted for the
     * other endpoint, and the server refused it. The only visible symptom was a submit
     * button that would not enable.
     */
    // The action is in here on purpose: switching between sign-in and sign-up on the one
    // page has to mint a token for the other endpoint, not reuse the previous one.
  }, [siteKey, element, action, i18n.language]);

  const reset = useCallback(() => {
    setToken(null);
    if (widget.current !== null) window.turnstile?.reset(widget.current);
  }, []);

  return {
    container: setElement,
    action,
    required: siteKey !== null,
    /*
     * A failed lookup counts as satisfied. Blocking every sign-in because this one small
     * endpoint answered badly would be the worse failure -- and it is not this client's
     * decision anyway: the server verifies, and answers 403 if it wanted a token.
     */
    satisfied: query.isPending ? false : siteKey === null || token !== null,
    token,
    reset,
    failed,
  };
}
