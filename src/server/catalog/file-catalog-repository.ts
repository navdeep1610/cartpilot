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

let cachedCatalog: Promise<CatalogSnapshot> | null = null;

export function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  cachedCatalog ??= loadCatalogSnapshot();
  return cachedCatalog;
}

export async function loadCatalogSnapshot(rootDirectory = process.cwd()): Promise<CatalogSnapshot> {
  const catalogDirectory = path.join(rootDirectory, "catalog");
  const [
    productRows,
    variantRows,
    economicsRows,
    profileRows,
    compatibilityRows,
    bundleRows,
    profitPolicySource,
    discountPolicySource,
    manifestSource,
  ] = await Promise.all([
    readCsv(path.join(catalogDirectory, "customer_catalog.csv")),
    readCsv(path.join(catalogDirectory, "product_variants.csv")),
    readCsv(path.join(catalogDirectory, "merchant_economics.csv")),
    readCsv(path.join(catalogDirectory, "product_profiles.csv")),
    readCsv(path.join(catalogDirectory, "product_compatibility.csv")),
    readCsv(path.join(catalogDirectory, "bundle_components.csv")),
    readFile(path.join(catalogDirectory, "profit_policy.json"), "utf8"),
    readFile(path.join(catalogDirectory, "discount_policy.json"), "utf8"),
    readFile(path.join(catalogDirectory, "catalog_manifest.json"), "utf8"),
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
  const manifestJson = JSON.parse(manifestSource) as { catalog_version?: string };

  return {
    version: manifestJson.catalog_version ?? "unversioned",
    products,
    variants,
    economics,
    profiles,
    compatibilityRules,
    bundleComponents,
    profitPolicy: toProfitPolicy(profitPolicyJson),
    discountPolicy: toDiscountPolicy(discountPolicyJson),
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

  return {
    variantId: required(row, "variant_id"),
    productId: required(row, "product_id"),
    size: required(row, "size"),
    pricePaise: inrToPaise(required(row, "price_inr")),
    currency,
    stockQuantity: integer(row, "stock_quantity"),
    isDefault: boolean(row, "is_default"),
    active: boolean(row, "active"),
    dataStatus: required(row, "data_status"),
  };
}

function toEconomics(row: Record<string, string>): MerchantEconomics {
  return {
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
  for (const rule of compatibilityRules) {
    if (!products.has(rule.sourceProductId) || !products.has(rule.targetProductId)) {
      throw new Error(`Compatibility rule ${rule.ruleId} references a missing product`);
    }
  }
  for (const component of bundleComponents) {
    if (!variants.has(component.bundleVariantId) || !variants.has(component.componentVariantId)) {
      throw new Error(`Bundle component ${component.bundleProductId} references a missing variant`);
    }
  }
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
