"use client";
import { StaffEntryError } from "@/components/auth/StaffEntryError";
export default function StaffError({ retry }: { retry: () => void }) {
  return <StaffEntryError retry={retry} />;
}
