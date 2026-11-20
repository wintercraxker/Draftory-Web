import type { ReactNode } from "react";
import { ApplicationFrame } from "@/components/layout/ApplicationFrame";
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <ApplicationFrame>{children}</ApplicationFrame>;
}
