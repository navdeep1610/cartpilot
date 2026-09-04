import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type {
  BundleComponent,
  CatalogProduct,
  CatalogSnapshot,
  DiscountPolicyConfig,
  MerchantEconomics,
  ProductCompatibilityRule,
  ProductProfile,
  ProductVariant,
  ProfitPolicyConfig,
} from "@/domain/catalog/types";
import { inrToPaise, percentToBps } from "@/domain/money";
import { validateCatalogManifest } from "@/server/catalog/manifest-validator";

let cachedCatalog: Promise<CatalogSnapshot> | null = null;

export function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  cachedCatalog ??= loadCatalogSnapshot();
  return cachedCatalog;
}

export async function loadCatalogSnapshot(rootDirectory = process.cwd()): Promise<CatalogSnapshot> {
  const catalogDirectory = path.join(rootDirectory, "catalog");
  const manifestSource = await readFile(path.join(catalogDirectory, "catalog_manifest.json"), "utf8");
  const { manifest, integrity } = await validateCatalogManifest(rootDirectory, manifestSource);
  const [
    productRows,
    variantRows,
    economicsRows,
    profileRows,
    compatibilityRows,
    bundleRows,
    profitPolicySource,
    discountPolicySource,
  ] = await Promise.all([
    readCsv(path.join(catalogDirectory, "customer_catalog.csv")),
    readCsv(path.join(catalogDirectory, "product_variants.csv")),
    readCsv(path.join(catalogDirectory, "merchant_economics.csv")),
    readCsv(path.join(catalogDirectory, "product_profiles.csv")),
    readCsv(path.join(catalogDirectory, "product_compatibility.csv")),
    readCsv(path.join(catalogDirectory, "bundle_components.csv")),
    readFile(path.join(catalogDirectory, "profit_policy.json"), "utf8"),
    readFile(path.join(catalogDirectory, "discount_policy.json"), "utf8"),
  ]);

  const products = uniqueMap(productRows.map(toProduct), (item) => item.productId, "product");
  const variants = uniqueMap(variantRows.map(toVariant), (item) => item.variantId, "variant");
  const economics = uniqueMap(economicsRows.map(toEconomics), (item) => item.variantId, "economics");
  const profiles = uniqueMap(profileRows.map(toProfile), (item) => item.productId, "profile");
  const compatibilityRules = compatibilityRows.map(toCompatibilityRule);
  const bundleComponents = bundleRows.map(toBundleComponent);

  validateReferences(products, variants, economics, profiles, compatibilityRules, bundleComponents);

  const profitPolicyJson = JSON.parse(profitPolicySource) as Record<string, unknown>;
  const discountPolicyJson = JSON.parse(discountPolicySource) as Record<string, unknown>;
  validateExpectedCounts(manifest.expected_snapshot, products, variants, economics, profiles, compatibilityRules, bundleComponents);
  const profitPolicy = toProfitPolicy(profitPolicyJson);
  const discountPolicy = toDiscountPolicy(discountPolicyJson);
  validatePolicyAlignment(profitPolicyJson, discountPolicyJson, profitPolicy, discountPolicy);

  return {
    version: manifest.catalog_version,
    integrity,
    products,
    variants,
    economics,
    profiles,
    compatibilityRules,
    bundleComponents,
    profitPolicy,
    discountPolicy,
  };
}

async function readCsv(filePath: string): Promise<Record<string, string>[]> {
  const source = await readFile(filePath, "utf8");
  return parse(source, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
}

function toProduct(row: Record<string, string>): CatalogProduct {
  return {
    productId: required(row, "product_id"),
    productType: required(row, "product_type"),
    productName: required(row, "product_name"),
    startingPricePaise: inrToPaise(required(row, "starting_price_inr")),
    sizesAvailable: split(row.sizes_available, ","),
    useCase: required(row, "use_case"),
    status: required(row, "status"),
  };
}

function toVariant(row: Record<string, string>): ProductVariant {
  const currency = required(row, "currency");
  if (currency !== "INR") throw new Error(`Unsupported currency ${currency}`);

  const pricePaise = inrToPaise(required(row, "price_inr"));
  const stockQuantity = integer(row, "stock_quantity");
  if (pricePaise <= 0 || stockQuantity < 0) throw new Error(`Invalid price or stock for ${row.variant_id}`);
  return {
    variantId: required(row, "variant_id"),
    productId: required(row, "product_id"),
    size: required(row, "size"),
    pricePaise,
    currency,
    stockQuantity,
    isDefault: boolean(row, "is_default"),
    active: boolean(row, "active"),
    dataStatus: required(row, "data_status"),
  };
}

function toEconomics(row: Record<string, string>): MerchantEconomics {
  const economics = {
    variantId: required(row, "variant_id"),
    unitCostPaise: inrToPaise(required(row, "unit_cost_inr")),
    packagingCostPaise: inrToPaise(required(row, "packaging_cost_inr")),
    fulfilmentCostPaise: inrToPaise(required(row, "fulfilment_cost_inr")),
    expectedReturnRateBps: percentToBps(required(row, "expected_return_rate_pct")),
    returnProcessingCostPaise: inrToPaise(required(row, "return_processing_cost_inr")),
    minContributionMarginPaise: inrToPaise(required(row, "min_contribution_margin_inr")),
    maxDiscountBps: percentToBps(required(row, "max_discount_pct")),
    inventoryPriority: required(row, "inventory_priority"),
    dataStatus: required(row, "data_status"),
  };
  if (
    economics.unitCostPaise < 0 ||
    economics.packagingCostPaise < 0 ||
    economics.fulfilmentCostPaise < 0 ||
    economics.returnProcessingCostPaise < 0 ||
    economics.minContributionMarginPaise < 0 ||
    economics.expectedReturnRateBps < 0 ||
    economics.expectedReturnRateBps > 10_000 ||
    economics.maxDiscountBps < 0 ||
    economics.maxDiscountBps > 10_000
  ) throw new Error(`Invalid economics range for ${economics.variantId}`);
  return economics;
}

function toProfile(row: Record<string, string>): ProductProfile {
  return {
    productId: required(row, "product_id"),
    routineStep: required(row, "routine_step"),
    routineOrder: integer(row, "routine_order"),
    productFormat: required(row, "product_format"),
    declaredActives: split(row.declared_actives, "|"),
    supportedSkinTypes: split(row.supported_skin_types, "|"),
    supportedConcerns: split(row.supported_concerns, "|"),
    usagePeriod: required(row, "usage_period"),
    usageFrequency: required(row, "usage_frequency"),
    daytimeSpfRule: required(row, "daytime_spf_rule"),
    recommendationMode: required(row, "recommendation_mode"),
    exclusionFlags: split(row.exclusion_flags, "|"),
    customerWarning: required(row, "customer_warning"),
    ingredientDataStatus: required(row, "ingredient_data_status"),
    safetySourceUrl: row.safety_source_url || null,
    reviewStatus: required(row, "review_status"),
  };
}

function toCompatibilityRule(row: Record<string, string>): ProductCompatibilityRule {
  return {
    ruleId: required(row, "rule_id"),
    sourceProductId: required(row, "source_product_id"),
    targetProductId: required(row, "target_product_id"),
    relationshipType: required(row, "relationship_type"),
    directionality: required(row, "directionality"),
    skinContext: required(row, "skin_context"),
    routineContext: required(row, "routine_context"),
    priorityRank: integer(row, "priority_rank"),
    safetyAction: required(row, "safety_action") as ProductCompatibilityRule["safetyAction"],
    reason: required(row, "reason"),
    sourceUrl: row.source_url || null,
    dataStatus: required(row, "data_status"),
  };
}

function toBundleComponent(row: Record<string, string>): BundleComponent {
  return {
    bundleProductId: required(row, "bundle_product_id"),
    bundleVariantId: required(row, "bundle_variant_id"),
    componentProductId: required(row, "component_product_id"),
    componentVariantId: required(row, "component_variant_id"),
    quantity: integer(row, "quantity"),
    componentRole: required(row, "component_role"),
    displayOrder: integer(row, "display_order"),
    required: boolean(row, "required"),
    active: boolean(row, "active"),
    dataStatus: required(row, "data_status"),
  };
}

function toProfitPolicy(json: Record<string, unknown>): ProfitPolicyConfig {
  const assumptions = object(json.mvp_assumptions, "mvp_assumptions");
  const ranking = object(json.ranking, "ranking");
  const floors = object(json.profit_floors, "profit_floors");
  return {
    policyId: stringValue(json.policy_id, "policy_id"),
    version: stringValue(json.version, "version"),
    paymentCostRateBps: numberValue(assumptions.payment_cost_rate_bps, "payment_cost_rate_bps"),
    paymentCostFixedPaise: numberValue(assumptions.payment_cost_fixed_paise, "payment_cost_fixed_paise"),
    scoreScaleFactor: numberValue(ranking.score_scale_factor, "score_scale_factor"),
    cartMinimumContributionProfitPaise: numberValue(floors.cart_minimum_contribution_profit_paise, "cart floor"),
    cartMinimumContributionMarginBps: numberValue(floors.cart_minimum_contribution_margin_bps, "margin floor"),
    minimumIncrementalContributionProfitPaise: numberValue(
      floors.minimum_incremental_contribution_profit_paise_for_additional_offer,
      "incremental profit floor",
    ),
    minimumOfferScoreImprovementBps: numberValue(
      floors.minimum_offer_score_improvement_bps_for_additional_offer,
      "score improvement floor",
    ),
  };
}

function toDiscountPolicy(json: Record<string, unknown>): DiscountPolicyConfig {
  const guards = object(json.global_guards, "global_guards");
  const crossSellPolicy = object(json.cross_sell_policy, "cross_sell_policy");
  const triggers = array(json.trigger_rules, "trigger_rules").map((value) => {
    const trigger = object(value, "trigger");
    return {
      triggerId: stringValue(trigger.trigger_id, "trigger_id"),
      enabled: Boolean(trigger.enabled),
      allowedDiscountBps: array(trigger.allowed_discount_pct, "allowed discounts").map((item) =>
        percentToBps(numberValue(item, "discount percentage")),
      ),
      maximumGapPaise:
        trigger.maximum_gap_paise === undefined ? null : numberValue(trigger.maximum_gap_paise, "maximum gap"),
      maximumGapBpsOfBudget:
        trigger.maximum_gap_bps_of_budget === undefined
          ? null
          : numberValue(trigger.maximum_gap_bps_of_budget, "maximum gap bps"),
    };
  });

  const thresholdIncentives = array(json.threshold_incentives, "threshold_incentives").map((value) => {
    const incentive = object(value, "threshold incentive");
    return {
      offerId: stringValue(incentive.offer_id, "offer_id"),
      enabled: Boolean(incentive.enabled),
      minimumEligibleSubtotalPaise: numberValue(incentive.minimum_eligible_subtotal_paise, "threshold subtotal"),
      discountPaise: numberValue(incentive.discount_paise, "threshold discount"),
      customerMessage: stringValue(incentive.customer_message, "customer message"),
    };
  });

  return {
    policyId: stringValue(json.policy_id, "policy_id"),
    version: stringValue(json.version, "version"),
    discountLadderBps: array(json.discount_ladder_pct, "discount ladder").map((item) =>
      percentToBps(numberValue(item, "discount percentage")),
    ),
    triggers,
    thresholdIncentives,
    allowDiscountStacking: Boolean(guards.allow_discount_stacking),
    allowAdditionalDiscountOnPrepricedBundles: Boolean(
      guards.allow_additional_dynamic_discount_on_prepriced_bundles,
    ),
    maximumDynamicDiscountsPerSession: numberValue(
      guards.maximum_dynamic_discounts_per_session,
      "maximum dynamic discounts per session",
    ),
    maximumCrossSellItemsPerCycle: numberValue(
      crossSellPolicy.maximum_cross_sell_items_per_cycle,
      "maximum cross-sell items per cycle",
    ),
  };
}

function validateReferences(
  products: ReadonlyMap<string, CatalogProduct>,
  variants: ReadonlyMap<string, ProductVariant>,
  economics: ReadonlyMap<string, MerchantEconomics>,
  profiles: ReadonlyMap<string, ProductProfile>,
  compatibilityRules: readonly ProductCompatibilityRule[],
  bundleComponents: readonly BundleComponent[],
): void {
  for (const variant of variants.values()) {
    if (!products.has(variant.productId)) throw new Error(`Variant ${variant.variantId} references a missing product`);
    if (!economics.has(variant.variantId)) throw new Error(`Variant ${variant.variantId} has no economics row`);
  }
  for (const product of products.values()) {
    if (!profiles.has(product.productId)) throw new Error(`Product ${product.productId} has no profile`);
  }
  for (const economicsRow of economics.values()) {
    if (!variants.has(economicsRow.variantId)) {
      throw new Error(`Economics row ${economicsRow.variantId} references a missing variant`);
    }
  }
  const compatibilityRuleIds = new Set<string>();
  for (const rule of compatibilityRules) {
    if (compatibilityRuleIds.has(rule.ruleId)) throw new Error(`Duplicate compatibility rule ${rule.ruleId}`);
    compatibilityRuleIds.add(rule.ruleId);
    if (!products.has(rule.sourceProductId) || !products.has(rule.targetProductId)) {
      throw new Error(`Compatibility rule ${rule.ruleId} references a missing product`);
    }
    if (!["allow", "clarify", "separate_use", "block_auto_bundle", "manual_review"].includes(rule.safetyAction)) {
      throw new Error(`Compatibility rule ${rule.ruleId} has an invalid safety action`);
    }
  }
  const bundleKeys = new Set<string>();
  for (const component of bundleComponents) {
    const bundleVariant = variants.get(component.bundleVariantId);
    const componentVariant = variants.get(component.componentVariantId);
    const bundleProduct = products.get(component.bundleProductId);
    if (!bundleVariant || !componentVariant || !bundleProduct) {
      throw new Error(`Bundle component ${component.bundleProductId} references a missing variant`);
    }
    if (
      bundleProduct.productType !== "Bundle" ||
      bundleVariant.productId !== component.bundleProductId ||
      componentVariant.productId !== component.componentProductId ||
      component.quantity < 1 ||
      component.displayOrder < 1
    ) throw new Error(`Bundle component identity is invalid for ${component.bundleProductId}`);
    const bundleKey = `${component.bundleVariantId}:${component.componentVariantId}`;
    if (bundleKeys.has(bundleKey)) throw new Error(`Duplicate bundle component ${bundleKey}`);
    bundleKeys.add(bundleKey);
  }
  const bundleGroups = Map.groupBy(bundleComponents, (component) => component.bundleVariantId);
  for (const [bundleVariantId, components] of bundleGroups) {
    const activeRequired = (components ?? []).filter((component) => component.active && component.required);
    if (activeRequired.length < 2 || new Set(activeRequired.map((item) => item.displayOrder)).size !== activeRequired.length) {
      throw new Error(`Bundle ${bundleVariantId} does not have valid required components`);
    }
  }
}

function validateExpectedCounts(
  expected: Record<string, unknown>,
  products: ReadonlyMap<string, CatalogProduct>,
  variants: ReadonlyMap<string, ProductVariant>,
  economics: ReadonlyMap<string, MerchantEconomics>,
  profiles: ReadonlyMap<string, ProductProfile>,
  compatibilityRules: readonly ProductCompatibilityRule[],
  bundleComponents: readonly BundleComponent[],
): void {
  const counts: Record<string, number> = {
    product_count: products.size,
    variant_count: variants.size,
    merchant_economics_row_count: economics.size,
    product_profile_count: profiles.size,
    compatibility_rule_count: compatibilityRules.length,
    bundle_count: new Set(bundleComponents.map((component) => component.bundleProductId)).size,
    bundle_component_row_count: bundleComponents.length,
  };
  for (const [key, actual] of Object.entries(counts)) {
    if (expected[key] !== actual) throw new Error(`Catalog snapshot count mismatch for ${key}`);
  }
}

function validatePolicyAlignment(
  profitJson: Record<string, unknown>,
  discountJson: Record<string, unknown>,
  profitPolicy: ProfitPolicyConfig,
  discountPolicy: DiscountPolicyConfig,
): void {
  const discountGuards = object(discountJson.global_guards, "global_guards");
  const profitRanking = object(profitJson.ranking, "ranking");
  if (
    profitJson.currency !== "INR" ||
    discountJson.currency !== "INR" ||
    profitJson.decision_mode !== "deterministic" ||
    discountJson.decision_mode !== "deterministic" ||
    profitJson.random_offer_selection !== false ||
    discountJson.random_offer_selection !== false ||
    profitJson.machine_learning_offer_selection_enabled !== false ||
    discountPolicy.maximumCrossSellItemsPerCycle !== 1 ||
    profitPolicy.cartMinimumContributionProfitPaise !== discountGuards.minimum_cart_contribution_margin_paise ||
    profitPolicy.cartMinimumContributionMarginBps !== discountGuards.minimum_cart_contribution_margin_bps ||
    profitPolicy.minimumIncrementalContributionProfitPaise !== discountGuards.minimum_incremental_contribution_profit_paise ||
    profitPolicy.minimumOfferScoreImprovementBps !== discountGuards.minimum_offer_score_improvement_bps ||
    profitPolicy.version !== profitJson.version ||
    profitRanking.version !== profitJson.version
  ) throw new Error("Discount and profit policy identities or hard gates are not aligned");
}

function uniqueMap<T>(values: readonly T[], key: (value: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const identifier = key(value);
    if (result.has(identifier)) throw new Error(`Duplicate ${label} identifier: ${identifier}`);
    result.set(identifier, value);
  }
  return result;
}

function required(row: Record<string, string>, key: string): string {
  const value = row[key]?.trim();
  if (!value) throw new Error(`Missing CSV value: ${key}`);
  return value;
}

function integer(row: Record<string, string>, key: string): number {
  const value = Number(required(row, key));
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid integer ${key}: ${row[key]}`);
  return value;
}

function boolean(row: Record<string, string>, key: string): boolean {
  const value = required(row, key).toLowerCase();
  if (value !== "true" && value !== "false") throw new Error(`Invalid boolean ${key}: ${value}`);
  return value === "true";
}

function split(value: string | undefined, separator: string): string[] {
  if (!value?.trim()) return [];
  return value.split(separator).map((item) => item.trim()).filter(Boolean);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid object: ${label}`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid array: ${label}`);
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid string: ${label}`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`Invalid integer: ${label}`);
  return value;
}
