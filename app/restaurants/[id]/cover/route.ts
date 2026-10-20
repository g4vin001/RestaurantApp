import { prisma } from "@/lib/prisma";
import { reportDataError } from "@/lib/server/data-error";

// Public restaurant photo. URLs carry a ?v= upload timestamp, so a versioned
// request can be cached forever; an unversioned one is revalidated quickly.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: slug } = await params;
  let image: { contentType: string; data: Uint8Array; updatedAt: Date } | null;
  try {
    image = await prisma.restaurantCoverImage.findFirst({
      where: { restaurant: { slug, environment: "LIVE", archivedAt: null } },
      select: { contentType: true, data: true, updatedAt: true },
    });
  } catch (error) {
    reportDataError("cover-image-read", error);
    return new Response(null, { status: 503 });
  }
  if (!image) return new Response(null, { status: 404 });

  const versioned = new URL(request.url).searchParams.get("v") === String(image.updatedAt.getTime());
  return new Response(Buffer.from(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
