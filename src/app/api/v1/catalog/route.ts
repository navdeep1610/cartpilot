import { createPublicCatalog } from "@/domain/catalog/public-catalog";
import { getCatalogSnapshot } from "@/server/catalog/file-catalog-repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await getCatalogSnapshot();
    return Response.json(createPublicCatalog(snapshot), {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
    });
  } catch {
    return Response.json(
      { error: "CATALOG_UNAVAILABLE", message: "The catalog is temporarily unavailable." },
      { status: 503 },
    );
  }
}
