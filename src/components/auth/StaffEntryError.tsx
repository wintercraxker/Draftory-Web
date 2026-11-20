"use client";
import { useRouter } from "next/navigation";
import { TechnicalErrorScreen } from "./AccessScreen";
export function StaffEntryError({
  retry,
  busy = false,
}: {
  retry?: () => void;
  busy?: boolean;
}) {
  const router = useRouter();
  return (
    <TechnicalErrorScreen
      retry={retry ?? (() => router.refresh())}
      busy={busy}
    />
  );
}
