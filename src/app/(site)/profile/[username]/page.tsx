// The shared frame keeps the current lobby alive while visiting public profiles.
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  await params;
  return null;
}
