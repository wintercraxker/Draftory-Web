import { RealMatchPage } from "@/components/auth/RealMatchPage";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <RealMatchPage id={(await params).id} />;
}
