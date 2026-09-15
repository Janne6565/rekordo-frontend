import { LibraryGate } from "@/features/firstPull/LibraryGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: LibraryGate,
});
