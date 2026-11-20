import { devRequest } from "@/lib/dev/http";
import { multiplayerDb, testActor } from "@/lib/dev/multiplayer";
import { readRealRoom, roomAction } from "@/lib/real/room-repository";
export const runtime = "nodejs";
export {
  devUnsupported as PUT,
  devUnsupported as PATCH,
  devUnsupported as DELETE,
  devUnsupported as OPTIONS,
  devUnsupported as HEAD,
} from "@/lib/dev/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return devRequest(request, async () => {
    const db = await multiplayerDb();
    return readRealRoom(await testActor(request, db), (await params).id, db);
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return devRequest(
    request,
    async () => {
      const db = await multiplayerDb();
      return roomAction(
        await testActor(request, db),
        (await params).id,
        await request.json(),
        db,
      );
    },
    true,
  );
}
