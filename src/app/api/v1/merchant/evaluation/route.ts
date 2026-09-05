import { guardMerchantApi } from "@/server/auth/merchant-authorization";
import { getGrowthEvaluationReport } from "@/server/evaluation/growth-evaluation";

export const runtime = "nodejs";

export async function GET() {
  const authError = await guardMerchantApi();
  if (authError) return authError;

  try {
    const report = await getGrowthEvaluationReport();
    return Response.json(report, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${report.reportId.toLowerCase()}.json"`,
      },
    });
  } catch {
    return Response.json(
      { error: "EVALUATION_UNAVAILABLE", message: "The versioned growth evaluation could not be generated." },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
