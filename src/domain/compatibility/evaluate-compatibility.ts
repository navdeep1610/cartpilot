import type {
  CatalogSnapshot,
  CompatibilityDecision,
  ProductCompatibilityRule,
} from "@/domain/catalog/types";

export interface CompatibilityEvaluation {
  decision: CompatibilityDecision;
  matchedRuleIds: string[];
  reasons: string[];
  unmatchedPairs: Array<{ firstProductId: string; secondProductId: string }>;
}

const decisionSeverity: Record<CompatibilityDecision, number> = {
  allow: 0,
  separate_use: 1,
  clarify: 2,
  block_auto_bundle: 3,
  manual_review: 4,
};

export function evaluateCompatibility(
  snapshot: CatalogSnapshot,
  productIds: readonly string[],
): CompatibilityEvaluation {
  const uniqueIds = [...new Set(productIds)];
  const matchedRules: ProductCompatibilityRule[] = [];
  const unmatchedPairs: CompatibilityEvaluation["unmatchedPairs"] = [];

  for (let left = 0; left < uniqueIds.length; left += 1) {
    for (let right = left + 1; right < uniqueIds.length; right += 1) {
      const first = uniqueIds[left];
      const second = uniqueIds[right];
      const pairRules = snapshot.compatibilityRules.filter((rule) => matchesPair(rule, first, second));
      if (pairRules.length === 0) {
        unmatchedPairs.push({ firstProductId: first, secondProductId: second });
      } else {
        matchedRules.push(...pairRules);
      }
    }
  }

  const matchedSeverity = matchedRules.reduce<CompatibilityDecision>(
    (current, rule) =>
      decisionSeverity[rule.safetyAction] > decisionSeverity[current] ? rule.safetyAction : current,
    "allow",
  );
  const highestSeverity =
    unmatchedPairs.length > 0 && decisionSeverity[matchedSeverity] < decisionSeverity.clarify
      ? "clarify"
      : matchedSeverity;

  return {
    decision: highestSeverity,
    matchedRuleIds: matchedRules.map((rule) => rule.ruleId).sort(),
    reasons: matchedRules
      .filter((rule) => rule.safetyAction !== "allow" || rule.relationshipType !== "complements")
      .sort((left, right) => right.priorityRank - left.priorityRank || left.ruleId.localeCompare(right.ruleId))
      .map((rule) => rule.reason)
      .concat(
        unmatchedPairs.length > 0
          ? ["CartPilot found no explicit catalog relationship for every proposed product pair, so it did not assume compatibility."]
          : [],
      ),
    unmatchedPairs,
  };
}

function matchesPair(rule: ProductCompatibilityRule, first: string, second: string): boolean {
  const forward = rule.sourceProductId === first && rule.targetProductId === second;
  const reverse = rule.sourceProductId === second && rule.targetProductId === first;
  return forward || reverse;
}
