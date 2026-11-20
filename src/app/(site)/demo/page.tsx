import { notFound } from "next/navigation";
import { demoEnabled } from "@/lib/auth/config";
export default function DemoPage() {
  if (!demoEnabled()) notFound();
  return null;
}
