import type { Metadata } from "next";
import { CheckCircle2, Download, FlaskConical, ShieldCheck, TrendingUp, TriangleAlert } from "lucide-react";
import { formatInr } from "@/domain/money";
import { MerchantSidebar } from "@/components/merchant/merchant-sidebar";
import { requireMerchantPage } from "@/server/auth/merchant-authorization";
import { getGrowthEvaluationReport } from "@/server/evaluation/growth-evaluation";

export const metadata: Metadata = {
  title: "Growth evidence · CartPilot",
  description: "Versioned synthetic growth evaluation and honest exception report for CartPilot.",
};

export const dynamic = "force-dynamic";

export default async function MerchantGrowthPage() {
  const merchant = await requireMerchantPage("/merchant/growth");
  const report = await getGrowthEvaluationReport();
  const { summary } = report;

  return (
    <main className="merchant-shell">
      <MerchantSidebar active="growth" label="Merchant growth evidence" merchantEmail={merchant.email} />

      <div className="merchant-content">
        <header className="merchant-header">
          <div>
            <p className="eyebrow">Track 01 · Reproducible merchant evidence</p>
            <h1>Growth evaluation, with exceptions included.</h1>
            <p>All documented scenarios run against the checked-in catalog and deterministic policy engines. Estimated profit is kept separate from realized merchant revenue.</p>
          </div>
          <div className="system-status"><span /><div><strong>{summary.executedScenarios}/{summary.totalScenarios} scenarios executed</strong><small>Report {report.reportVersion} · synthetic evaluation</small></div></div>
        </header>

        <section className="growth-summary" aria-labelledby="growth-summary-title">
          <div className="dashboard-heading">
            <div><p className="eyebrow">Evaluation summary</p><h2 id="growth-summary-title">What the replay demonstrates.</h2></div>
            <a className="evaluation-download" href="/api/v1/merchant/evaluation"><Download size={15} /> Export versioned JSON</a>
          </div>
          <div className="growth-metric-grid">
            <Metric icon={<FlaskConical />} label="Scenario coverage" value={`${summary.executedScenarios}/${summary.totalScenarios}`} detail="Every documented synthetic case executed" />
            <Metric icon={<CheckCircle2 />} label="Expected outcomes" value={formatPercent(summary.outcomeMatchRateBps)} detail={`${summary.matchedScenarios} matched · ${summary.exceptionScenarios} exceptions`} />
            <Metric icon={<TrendingUp />} label="Estimated profit uplift" value={formatPercent(summary.contributionProfitUpliftBps)} detail={`${formatInr(summary.incrementalContributionProfitPaise)} across ${summary.growthCohortScenarios} growth cases`} />
            <Metric icon={<ShieldCheck />} label="Safety outcomes" value={`${summary.safetyScenariosPassed}/${summary.safetyScenarioCount}`} detail="Documented safety cases matched" />
          </div>
          <div className="growth-comparison" aria-label="Baseline and assisted evaluation comparison">
            <div><small>Product-only baseline AOV</small><strong>{formatInr(summary.baselineAverageOrderValuePaise)}</strong></div>
            <span>→</span>
            <div><small>Assisted estimated AOV</small><strong>{formatInr(summary.assistedAverageOrderValuePaise)}</strong></div>
            <div><small>Baseline contribution profit</small><strong>{formatInr(summary.baselineContributionProfitPaise)}</strong></div>
            <span>→</span>
            <div><small>Assisted contribution profit</small><strong>{formatInr(summary.assistedContributionProfitPaise)}</strong></div>
          </div>
          <p className="evaluation-caveat"><TriangleAlert size={16} /> Synthetic replay evidence only. These figures do not claim observed conversion lift or realized revenue.</p>
        </section>

        <section className="evaluation-results" aria-labelledby="evaluation-results-title">
          <div className="dashboard-heading">
            <div><p className="eyebrow">Honest exception report</p><h2 id="evaluation-results-title">All 35 scenario outcomes.</h2></div>
            <p>Failures stay visible; no exception is removed from the headline rate.</p>
          </div>
          <div className="evaluation-table-wrap">
            <table className="evaluation-table">
              <thead><tr><th>Scenario</th><th>Class</th><th>Actual outcome</th><th>Money evidence</th><th>Result</th></tr></thead>
              <tbody>{report.results.map((result) => (
                <tr key={result.scenarioId}>
                  <td><strong>{result.scenarioId}</strong><small>{result.shopperRequest}</small></td>
                  <td><span className="evaluation-class">{result.scenarioClass}</span></td>
                  <td><strong>{humanize(result.actual.action)}</strong><small>{result.actual.productIds.join(" · ") || "No product action"}</small><small>{humanize(result.actual.reasonCode)}</small></td>
                  <td>{result.money ? <><strong>{formatInr(result.money.incrementalContributionProfitPaise)}</strong><small>Incremental estimated profit</small></> : <small>Not a comparable growth cart</small>}</td>
                  <td>{result.passed
                    ? <span className="evaluation-result passed"><CheckCircle2 size={14} /> Match</span>
                    : <div><span className="evaluation-result exception"><TriangleAlert size={14} /> Exception</span>{result.exceptions.map((exception) => <small className="evaluation-exception" key={exception.field}>{humanize(exception.field)}: expected {exception.expected}; got {exception.actual}</small>)}</div>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className="evaluation-method" aria-labelledby="evaluation-method-title">
          <div><p className="eyebrow">Method and provenance</p><h2 id="evaluation-method-title">Reproducible by design.</h2></div>
          <dl>
            <div><dt>Catalog</dt><dd>{report.catalogVersion}</dd></div>
            <div><dt>Profit policy</dt><dd>{report.profitPolicyVersion}</dd></div>
            <div><dt>Discount policy</dt><dd>{report.discountPolicyVersion}</dd></div>
            <div><dt>Scenario SHA-256</dt><dd><code>{report.scenarioSourceHash}</code></dd></div>
          </dl>
          <ol>{report.methodology.map((item) => <li key={item}>{item}</li>)}</ol>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article><span>{icon}</span><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>;
}

function formatPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll(".", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
