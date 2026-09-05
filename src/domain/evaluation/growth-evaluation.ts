export interface EvaluationScenario {
  scenarioId: string;
  scenarioClass: string;
  shopperRequest: string;
  skinType: string;
  skinConcern: string;
  budgetPaise: number | null;
  startingCartVariantIds: string[];
  sessionSignal: string | null;
  simulatedCondition: string;
  expected: EvaluationObservation;
  notes: string;
}

export interface EvaluationObservation {
  action: string;
  productIds: string[];
  offerId: string | null;
  discountTrigger: string | null;
  discountPercentOptions: number[];
  safetyAction: string;
  reasonCode: string;
  paymentState: string;
}

export interface EvaluationMoneyEvidence {
  baselineRevenuePaise: number;
  assistedRevenuePaise: number;
  baselineContributionProfitPaise: number;
  assistedContributionProfitPaise: number;
  incrementalContributionProfitPaise: number;
}

export interface EvaluationException {
  field: keyof EvaluationObservation;
  expected: string;
  actual: string;
}

export interface EvaluationResult {
  scenarioId: string;
  scenarioClass: string;
  shopperRequest: string;
  simulatedCondition: string;
  passed: boolean;
  expected: EvaluationObservation;
  actual: EvaluationObservation;
  exceptions: EvaluationException[];
  money: EvaluationMoneyEvidence | null;
  notes: string;
}

export interface GrowthEvaluationSummary {
  totalScenarios: number;
  executedScenarios: number;
  matchedScenarios: number;
  exceptionScenarios: number;
  outcomeMatchRateBps: number;
  growthCohortScenarios: number;
  baselineRevenuePaise: number;
  assistedRevenuePaise: number;
  baselineContributionProfitPaise: number;
  assistedContributionProfitPaise: number;
  incrementalContributionProfitPaise: number;
  contributionProfitUpliftBps: number;
  baselineAverageOrderValuePaise: number;
  assistedAverageOrderValuePaise: number;
  safetyScenarioCount: number;
  safetyScenariosPassed: number;
}

export interface GrowthEvaluationReport {
  reportId: string;
  reportVersion: string;
  engineVersion: string;
  catalogVersion: string;
  profitPolicyVersion: string;
  discountPolicyVersion: string;
  scenarioSourceHash: string;
  syntheticEvaluation: true;
  claimsRealizedRevenue: false;
  summary: GrowthEvaluationSummary;
  results: EvaluationResult[];
  methodology: string[];
}
