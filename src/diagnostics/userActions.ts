/**
 * The interactions that are timed as Faro user actions.
 *
 * A closed list rather than free text, for the same reason the translations are typed: an
 * action name is a query key in Grafana, and "copy.add" and "copy-add" would silently be
 * two different actions with half the data each.
 *
 * Deliberately short. An action is worth naming when "how long did that take, and which
 * requests did it set off" is a question worth asking about it — the flows that decide
 * whether Rekordo works — not every button in the app. Naming everything turns the actions
 * view into a list nobody reads.
 *
 * Only the NAME leaves the browser. Faro records no element text and no input values for
 * an action, and nothing here attaches attributes, so a record's title or a typed search
 * never rides along. Only collected at the FULL level, which is the one whose disclosure
 * covers "an action you took in the browser".
 */
export type UserActionName =
  /** Adding a record from a catalogue search result. */
  | "copy.add"
  /** Adding a record by hand, when the catalogue has no match. */
  | "copy.add-manual"
  /** Saving a copy's details: condition, notes, price. */
  | "copy.save"
  | "copy.remove"
  /** Undo within the delete's hold window. */
  | "copy.restore"
  /** Putting a catalogue result on the wishlist straight from search. */
  | "wish.add"
  | "wish.save"
  | "auth.sign-in"
  | "auth.sign-up";

/** The attribute Faro's UserActionInstrumentation listens for. */
export const USER_ACTION_ATTRIBUTE = "data-faro-user-action-name";
