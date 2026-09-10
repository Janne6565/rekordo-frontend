import { setAccessToken } from "@/api/axios-instance";
import { login, logout, providers, register } from "@/api/generated/auth/auth";
import { invalidFields } from "@/api/problem";
import { useStore } from "@/local/StoreProvider";
import { signedIn, signedOut } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  /**
   * Two ticks, neither pre-checked (screen 17a).
   *
   * Separate booleans rather than one, because they are two statements: agreeing to the
   * terms is a contract, confirming an age is a declaration of fact, and a single box that
   * bundled them would let somebody agree to one by accepting the other.
   */
  const [agreed, setAgreed] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
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
              acceptedTerms: agreed,
              confirmedAge: ageConfirmed,
            })
          : await login({ email: email.trim(), password, rememberMe });
      if (session.accessToken == null || session.user == null) {
        throw new Error("The server did not return a session");
      }
      setAccessToken(session.accessToken);

      // A device that already holds a collection has to be asked what to do with it before
      // anything is pushed or pulled — every option is destructive in one direction.
      const hasLocalCollection = (await store.listCopies()).length > 0;
      const hasSyncedBefore = (await store.readSyncCursor()) > 0;
      return { user: session.user, firstSyncPending: hasLocalCollection && !hasSyncedBefore };
    },
    onSuccess: ({ user, firstSyncPending }) => {
      dispatch(signedIn({ user, firstSyncPending }));
      setFailed([]);
      // Always, now: the conflict dialogue is drawn over the library rather than here, so
      // the library is where the question gets asked (29).
      void navigate({ to: "/" });
    },
    onError: (error: unknown) => {
      setFailed(errorsFrom(error));
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
    agreed,
    setAgreed,
    ageConfirmed,
    setAgeConfirmed,
    availableProviders: providerQuery.data ?? [],
    // Completeness only — the server validates the address and password properly, and a
    // dead button that will not say why is worse than a rejected submit. The two consent
    // boxes are the exception: they are required acknowledgements, not format rules, and
    // the server refuses a registration without them anyway.
    canSubmit:
      email.trim().length > 0 &&
      password.length > 0 &&
      (mode === "SIGN_IN" || (agreed && ageConfirmed)),
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
