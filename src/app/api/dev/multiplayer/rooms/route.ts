import { devRequest } from "@/lib/dev/http";
import { multiplayerDb, testActor } from "@/lib/dev/multiplayer";
import { listRealRooms } from "@/lib/real/room-repository";
export const runtime = "nodejs";
export {
  devUnsupported as POST,
  devUnsupported as PUT,
  devUnsupported as PATCH,
  devUnsupported as DELETE,
  devUnsupported as OPTIONS,
  devUnsupported as HEAD,
} from "@/lib/dev/http";
export async function GET(request: Request) {
  return devRequest(request, async () => {
    const db = await multiplayerDb();
    return listRealRooms(await testActor(request, db), db);
  });
}
