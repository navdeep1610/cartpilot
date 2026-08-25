import type {
  CatalogSnapshot,
  CompatibilityDecision,
  ProductCompatibilityRule,
} from "@/domain/catalog/types";

export interface CompatibilityEvaluation {
  decision: CompatibilityDecision;
  matchedRuleIds: string[];
  reasons: string[];
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

  for (let left = 0; left < uniqueIds.length; left += 1) {
    for (let right = left + 1; right < uniqueIds.length; right += 1) {
      const first = uniqueIds[left];
      const second = uniqueIds[right];
      matchedRules.push(
        ...snapshot.compatibilityRules.filter((rule) => matchesPair(rule, first, second)),
      );
    }
  }

  const highestSeverity = matchedRules.reduce<CompatibilityDecision>(
    (current, rule) =>
      decisionSeverity[rule.safetyAction] > decisionSeverity[current] ? rule.safetyAction : current,
    "allow",
  );

  return {
    decision: highestSeverity,
    matchedRuleIds: matchedRules.map((rule) => rule.ruleId).sort(),
    reasons: matchedRules
      .filter((rule) => rule.safetyAction !== "allow" || rule.relationshipType !== "complements")
      .sort((left, right) => right.priorityRank - left.priorityRank || left.ruleId.localeCompare(right.ruleId))
      .map((rule) => rule.reason),
  };
}

function matchesPair(rule: ProductCompatibilityRule, first: string, second: string): boolean {
  const forward = rule.sourceProductId === first && rule.targetProductId === second;
  const reverse = rule.sourceProductId === second && rule.targetProductId === first;
  return forward || reverse;
}
