import {
  devices,
  muteDevice,
  preferences,
  updatePreference,
} from "@/api/generated/notifications/notifications";
import type {
  NotificationPreferenceDto,
  NotificationPreferenceDtoCategory,
} from "@/api/generated/rekordoAPI.schemas";
import { useAccountLogic } from "@/features/account/useAccountLogic";
import { useAppSelector } from "@/store/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Screen 22a — what may reach you outside the app.
 *
 * The grid follows the *account*, deliberately unlike everything else under Settings, which
 * stays on the device that set it. That is why it is a query against the server rather than
 * a read of the local store: set it here and the phone agrees, without a sync round.
 *
 * Changes save as you make them, and the server answers every flip with the whole grid — so
 * nothing here has to re-derive what a locked row now reads.
 */
export function useNotificationsLogic() {
  const queryClient = useQueryClient();
  const auth = useAppSelector((state) => state.auth);
  const { stats } = useAccountLogic();

  const grid = useQuery({
    queryKey: ["notificationPreferences"],
    queryFn: () => preferences(),
    enabled: auth.status === "signedIn",
  });

  /**
   * The second, shorter question: which device buzzes. It is a separate list on purpose —
   * a phone in a drawer and a phone in a pocket disagree, and the categories above are
   * never duplicated per phone.
   *
   * This browser is never in it: it has no push transport of its own and does not ask for
   * one, so the list is what the phone registered.
   */
  const deviceList = useQuery({
    queryKey: ["notificationDevices"],
    queryFn: () => devices(),
    enabled: auth.status === "signedIn",
  });

  const mute = useMutation({
    mutationFn: async (next: { id: string; muted: boolean }) =>
      muteDevice(next.id, { muted: next.muted }),
    onSuccess: (answer) => queryClient.setQueryData(["notificationDevices"], answer),
  });

  const flip = useMutation({
    mutationFn: async (next: {
      category: NonNullable<NotificationPreferenceDtoCategory>;
      mail: boolean;
      push: boolean;
    }) => updatePreference(next),
    onSuccess: (answer) => queryClient.setQueryData(["notificationPreferences"], answer),
  });

  const categories: NotificationPreferenceDto[] = grid.data?.categories ?? [];

  return {
    status: auth.status,
    stats,
    categories,
    loading: grid.isPending,
    /** No device on this account can receive a push, so the column has nothing to offer. */
    pushAvailable: grid.data?.pushAvailable === true,
    /**
     * An unconfirmed address is not a switch problem, it is a mailbox problem — so the mail
     * column says so and points at the account row rather than pretending it is on.
     */
    emailReachable: auth.user?.emailVerified !== false,
    /**
     * True when nothing at all would leave the building. Security mail is excluded on
     * purpose: it is not silenceable, so counting it would mean this line never appears.
     */
    allQuiet:
      categories.length > 0 &&
      categories.every(
        (row) => row.mailLocked === true || (row.mail !== true && row.push !== true),
      ),
    setChannel: (
      category: NonNullable<NotificationPreferenceDtoCategory>,
      channel: "mail" | "push",
      on: boolean,
    ) => {
      const row = categories.find((candidate) => candidate.category === category);
      if (row === undefined) return;
      flip.mutate({
        category,
        mail: channel === "mail" ? on : row.mail === true,
        push: channel === "push" ? on : row.push === true,
      });
    },
    devices: deviceList.data ?? [],
    setMuted: (id: string, muted: boolean) => mute.mutate({ id, muted }),
    saving: flip.isPending,
    failed: flip.isError || mute.isError,
  };
}
