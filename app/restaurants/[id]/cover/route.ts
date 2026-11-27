import { prisma } from "@/lib/prisma";
import { reportDataError } from "@/lib/server/data-error";
import { publicRestaurantScope } from "@/lib/restaurants/customer-access";

// Recheck publication on every image request, including versioned URLs.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: slug } = await params;
  let image: { contentType: string; data: Uint8Array } | null;
  try {
    image = await prisma.restaurantCoverImage.findFirst({
      where: { restaurant: { slug, ...publicRestaurantScope } },
      select: { contentType: true, data: true },
    });
  } catch (error) {
    reportDataError("cover-image-read", error);
    return new Response(null, { status: 503 });
  }
  if (!image) return new Response(null, { status: 404 });

  return new Response(Buffer.from(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
