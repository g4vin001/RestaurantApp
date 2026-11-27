import { requirePlatformAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { reviewUuid } from "@/lib/restaurants/review";
import { reportDataError } from "@/lib/server/data-error";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  await requirePlatformAdmin();
  const { id, documentId } = await params;
  if (!reviewUuid(id) || !reviewUuid(documentId)) return new Response(null, { status: 404, headers: privateHeaders });
  try {
    const document = await prisma.restaurantApplicationEvidence.findFirst({
      where: { id: documentId, applicationId: id },
      select: { filename: true, contentType: true, content: true },
    });
    if (!document) return new Response(null, { status: 404, headers: privateHeaders });
    return new Response(new Uint8Array(document.content), { headers: {
      ...privateHeaders, "Content-Type": document.contentType,
      "Content-Disposition": `attachment; filename="${document.filename.replace(/[^a-z0-9._ -]/gi, "_")}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch {
    const reference = reportDataError("restaurant-evidence", new Error("Evidence lookup failed"));
    return new Response(`Document unavailable. Try again. Support reference: ${reference}`, { status: 503, headers: privateHeaders });
  }
}
