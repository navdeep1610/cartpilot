import { describe, expect, it } from "vitest";
import { runGrowthEvaluation } from "@/server/evaluation/growth-evaluation";

describe("growth evaluation", () => {
  it("executes every versioned scenario and publishes honest aggregate evidence", async () => {
    const report = await runGrowthEvaluation();
    expect(report.summary.totalScenarios).toBe(35);
    expect(report.summary.executedScenarios).toBe(35);
    expect(report.summary.matchedScenarios).toBe(31);
    expect(report.summary.exceptionScenarios).toBe(4);
    expect(report.summary.outcomeMatchRateBps).toBe(8_857);
    expect(report.results).toHaveLength(35);
    expect(report.scenarioSourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.syntheticEvaluation).toBe(true);
    expect(report.claimsRealizedRevenue).toBe(false);
    expect(report.summary.matchedScenarios + report.summary.exceptionScenarios).toBe(35);
    expect(report.summary.growthCohortScenarios).toBeGreaterThan(0);
    expect(report.summary.incrementalContributionProfitPaise).toBeGreaterThan(0);
    expect(report.summary).toMatchObject({
      growthCohortScenarios: 8,
      baselineRevenuePaise: 364_200,
      assistedRevenuePaise: 743_400,
      baselineContributionProfitPaise: 177_556,
      assistedContributionProfitPaise: 371_342,
      incrementalContributionProfitPaise: 193_786,
      contributionProfitUpliftBps: 10_914,
      safetyScenarioCount: 10,
      safetyScenariosPassed: 10,
    });
    expect(report.results.filter((result) => !result.passed).map((result) => result.scenarioId)).toEqual([
      "EV-002",
      "EV-019",
      "EV-020",
      "EV-032",
    ]);
  });

  it("replays failure, payment and policy boundary cases deterministically", async () => {
    const report = await runGrowthEvaluation();
    const requiredMatches = ["EV-024", "EV-025", "EV-026", "EV-027", "EV-028", "EV-029", "EV-030", "EV-031", "EV-034", "EV-035"];

    for (const scenarioId of requiredMatches) {
      expect(report.results.find((result) => result.scenarioId === scenarioId)?.passed, scenarioId).toBe(true);
    }
  });

  it("produces the same report for the same catalog and scenario snapshot", async () => {
    const first = await runGrowthEvaluation();
    const second = await runGrowthEvaluation();

    expect(second).toEqual(first);
  });
});
