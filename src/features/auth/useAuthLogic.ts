import { setAccessToken } from "@/api/axios-instance";
import { login, logout, providers, register } from "@/api/generated/auth/auth";
import { invalidFields } from "@/api/problem";
import { useChallenge } from "@/features/auth/useChallenge";
import { useStore } from "@/local/StoreProvider";
import { signedIn, signedOut } from "@/store/authSlice";
import { firstPullStarted } from "@/store/firstPullSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { readSyncStart } from "@/sync/syncStart";
import { passwordLongEnough } from "@janne6565/rekordo-shared";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

export type AuthMode = "SIGN_IN" | "REGISTER";
export type AuthError =
  | "badCredentials"
  | "emailTaken"
  | "invalidEmail"
  | "passwordTooShort"
  | "consentRequired"
  | "challengeFailed"
  | "generic";

/**
 * Which input a rejected field belongs to.
 *
 * The server sends the field names it refused, not a message the screen could show — the
 * wording is looked up here so it arrives in the reader's language. Anything not in this
 * map falls back to the generic line rather than inventing a sentence for a field this
 * form does not have.
 */
const FIELD_ERRORS: Readonly<Record<string, AuthError>> = {
  email: "invalidEmail",
  password: "passwordTooShort",
  acceptedTerms: "consentRequired",
  confirmedAge: "consentRequired",
};

function errorsFrom(error: unknown): AuthError[] {
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 409) return ["emailTaken"];
  if (status === 401) return ["badCredentials"];
  // The bot check. Its own status precisely so it can be told apart from a wrong password
  // and from a rate limit: the only useful response to it is to solve a fresh challenge,
  // which is what the widget below is reset for.
  if (status === 403) return ["challengeFailed"];
  // One line per distinct complaint: both consent ticks map to the same sentence, and
  // printing it twice would read as two different problems.
  const named = [
    ...new Set(
      invalidFields(error)
        .map((field) => FIELD_ERRORS[field])
        .filter((mapped): mapped is AuthError => mapped !== undefined),
    ),
  ];
  return named.length > 0 ? named : ["generic"];
}

export function useAuthLogic() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { store } = useStore();
  const auth = useAppSelector((state) => state.auth);

  const [mode, setMode] = useState<AuthMode>("SIGN_IN");
  /*
   * One widget, re-created when the mode flips: a token carries the action it was solved
   * for, and the server refuses a sign-in token presented at sign-up.
   */
  const challenge = useChallenge(mode === "REGISTER" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  /**
   * One tick, never pre-checked (sign-in turn 2, replacing 17a's two).
   *
   * Its sentence names both statements, the terms and the age, so ticking it cannot be
   * read as agreeing to one alone. The server still receives them as two fields, which is
   * how the consent record keeps them apart.
   */
  const [consented, setConsented] = useState(false);
  const [failed, setFailed] = useState<readonly AuthError[]>([]);

  // Only providers the server can actually complete a flow with, so an unconfigured one
  // is absent rather than a button that fails when pressed.
  const providerQuery = useQuery({ queryKey: ["authProviders"], queryFn: () => providers() });

  const submit = useMutation({
    mutationFn: async () => {
      const session =
        mode === "REGISTER"
          ? await register({
              email: email.trim(),
              password,
              displayName: displayName.trim(),
              acceptedTerms: consented,
              confirmedAge: consented,
              turnstileToken: challenge.token,
            })
          : await login({
              email: email.trim(),
              password,
              rememberMe,
              turnstileToken: challenge.token,
            });
      if (session.accessToken == null || session.user == null) {
        throw new Error("The server did not return a session");
      }
      setAccessToken(session.accessToken);

      // A device that already holds a collection has to be asked what to do with it before
      // anything is pushed or pulled — every option is destructive in one direction. One
      // that holds nothing waits for its first pull instead of showing an empty shelf.
      return { user: session.user, ...(await readSyncStart(store)) };
    },
    onSuccess: ({ user, firstSyncPending, awaitingFirstPull }) => {
      // Before `signedIn`, so the library never renders one frame of "your shelf is empty".
      if (awaitingFirstPull) dispatch(firstPullStarted());
      dispatch(signedIn({ user, firstSyncPending }));
      setFailed([]);
      // Spent either way: a token is redeemed exactly once, so leaving it in place would
      // make a second attempt on this page fail for a reason nobody could see.
      challenge.reset();
      // Always, now: the conflict dialogue is drawn over the library rather than here, so
      // the library is where the question gets asked (29).
      void navigate({ to: "/" });
    },
    onError: (error: unknown) => {
      setFailed(errorsFrom(error));
      challenge.reset();
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      await logout().catch(() => undefined);
      setAccessToken(null);
    },
    onSuccess: async () => {
      dispatch(signedOut());
      // The local collection deliberately stays: signing out returns the app to how it
      // behaves with no account, and wiping someone's records on sign-out would be a
      // spectacular way to lose data.
      await queryClient.invalidateQueries();
    },
  });

  return {
    auth,
    mode,
    setMode: useCallback((next: AuthMode) => {
      setMode(next);
      setFailed([]);
    }, []),
    email,
    setEmail,
    password,
    setPassword,
    displayName,
    setDisplayName,
    rememberMe,
    setRememberMe,
    consented,
    setConsented,
    availableProviders: providerQuery.data ?? [],
    challenge,
    // Completeness only — the server validates the address and password properly, and a
    // dead button that will not say why is worse than a rejected submit. The two consent
    // boxes are the exception: they are required acknowledgements, not format rules, and
    // the server refuses a registration without them anyway.
    canSubmit:
      email.trim().length > 0 &&
      password.length > 0 &&
      (mode === "SIGN_IN" || consented) &&
      // Unsolved, or the site key not yet known. The second half matters: without it the
      // first submit after a cold load would post before this client learned a token was
      // required, and be refused with a 403 that looks like nothing the form did.
      challenge.satisfied,
    submit: () => {
      // The one rule worth checking before the round trip, because the server can only
      // answer it with the same sentence the field already carries as a hint.
      if (mode === "REGISTER" && !passwordLongEnough(password)) {
        setFailed(["passwordTooShort"]);
        return;
      }
      setFailed([]);
      submit.mutate();
    },
    submitting: submit.isPending,
    failed,
    signOut: () => signOut.mutate(),
    signingOut: signOut.isPending,
  };
}
