import { SignInConflictGate } from "@/features/auth/SignInConflict";
import { UndoProvider } from "@/features/detail/UndoDelete";
import { ConsentSlip } from "@/features/diagnostics";
import { NotFoundPage } from "@/features/notFound/NotFoundPage";
import { Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  // Turn 30: any path nothing answers to, and every `notFound()` a route throws without a
  // page of its own for it. Rendered in the root's outlet, so the providers below hold.
  notFoundComponent: NotFoundPage,
  component: () => (
    // Above the router on purpose: a delete happens on the detail page and immediately
    // returns to the library, so the six seconds in which it can be taken back have to
    // outlive the route that started them.
    <UndoProvider>
      <Outlet />
      {/*
       * Above the router too, and for a stronger reason (29): the sign-in conflict is a
       * question about the library, so it is asked over the library rather than on the
       * page somebody happened to sign in from. Mounted here it survives the navigation
       * away from /signin and cannot be escaped by one.
       */}
      <SignInConflictGate />
      {/*
       * Above the router as well, and for the plainest reason of the three: the question is
       * about this browser, not about any one screen. It is asked on the first visit
       * whether or not anybody is signed in, because consent has to precede collection and
       * a visitor without an account is no less entitled to be asked.
       */}
      <ConsentSlip />
    </UndoProvider>
  ),
});
