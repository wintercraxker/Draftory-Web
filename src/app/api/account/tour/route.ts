import { availableTourImages } from "@/lib/tour/assets";
import { accountRequest, boundedJson } from "@/lib/real/http";
import { prisma } from "@/lib/prisma";
import { readTour, writeTour } from "@/lib/real/account-lifecycle";
export async function GET(request: Request) {
  return accountRequest(request, async (id) => {
    const state = await readTour(prisma, id);
    const images = await availableTourImages();
    return { ...state, images };
  });
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) => writeTour(prisma, id, await boundedJson(request, 512)),
    true,
  );
}
