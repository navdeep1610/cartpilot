export type ProductStatus = "active" | "inactive" | string;

export interface CatalogProduct {
  productId: string;
  productType: string;
  productName: string;
  startingPricePaise: number;
  sizesAvailable: string[];
  useCase: string;
  status: ProductStatus;
}

export interface ProductVariant {
  variantId: string;
  productId: string;
  size: string;
  pricePaise: number;
  currency: "INR";
  stockQuantity: number;
  isDefault: boolean;
  active: boolean;
  dataStatus: string;
}

export interface MerchantEconomics {
  variantId: string;
  unitCostPaise: number;
  packagingCostPaise: number;
  fulfilmentCostPaise: number;
  expectedReturnRateBps: number;
  returnProcessingCostPaise: number;
  minContributionMarginPaise: number;
  maxDiscountBps: number;
  inventoryPriority: string;
  dataStatus: string;
}

export interface ProductProfile {
  productId: string;
  routineStep: string;
  routineOrder: number;
  productFormat: string;
  declaredActives: string[];
  supportedSkinTypes: string[];
  supportedConcerns: string[];
  usagePeriod: string;
  usageFrequency: string;
  daytimeSpfRule: string;
  recommendationMode: string;
  exclusionFlags: string[];
  customerWarning: string;
  ingredientDataStatus: string;
  safetySourceUrl: string | null;
  reviewStatus: string;
}

export type CompatibilityDecision =
  | "allow"
  | "clarify"
  | "separate_use"
  | "block_auto_bundle"
  | "manual_review";

export interface ProductCompatibilityRule {
  ruleId: string;
  sourceProductId: string;
  targetProductId: string;
  relationshipType: string;
  directionality: "directional" | "bidirectional" | string;
  skinContext: string;
  routineContext: string;
  priorityRank: number;
  safetyAction: CompatibilityDecision;
  reason: string;
  sourceUrl: string | null;
  dataStatus: string;
}

export interface BundleComponent {
  bundleProductId: string;
  bundleVariantId: string;
  componentProductId: string;
  componentVariantId: string;
  quantity: number;
  componentRole: string;
  displayOrder: number;
  required: boolean;
  active: boolean;
  dataStatus: string;
}

export interface ProfitPolicyConfig {
  policyId: string;
  version: string;
  paymentCostRateBps: number;
  paymentCostFixedPaise: number;
  scoreScaleFactor: number;
  cartMinimumContributionProfitPaise: number;
  cartMinimumContributionMarginBps: number;
  minimumIncrementalContributionProfitPaise: number;
  minimumOfferScoreImprovementBps: number;
}

export interface DiscountTriggerConfig {
  triggerId: string;
  enabled: boolean;
  allowedDiscountBps: number[];
  maximumGapPaise: number | null;
  maximumGapBpsOfBudget: number | null;
}

export interface ThresholdIncentiveConfig {
  offerId: string;
  enabled: boolean;
  minimumEligibleSubtotalPaise: number;
  discountPaise: number;
  customerMessage: string;
}

export interface DiscountPolicyConfig {
  policyId: string;
  version: string;
  discountLadderBps: number[];
  triggers: DiscountTriggerConfig[];
  thresholdIncentives: ThresholdIncentiveConfig[];
  allowDiscountStacking: boolean;
  allowAdditionalDiscountOnPrepricedBundles: boolean;
  maximumDynamicDiscountsPerSession: number;
  maximumCrossSellItemsPerCycle: number;
}

export interface CatalogIntegrityMetadata {
  manifestVersion: string;
  manifestHash: string;
  loadedAt: string;
  resourceHashes: Readonly<Record<string, string>>;
  resourceVersions: Readonly<Record<string, string>>;
  schemaVersions: Readonly<Record<string, string>>;
  validationStatus: "valid";
}

export interface CatalogSnapshot {
  version: string;
  integrity: CatalogIntegrityMetadata;
  products: ReadonlyMap<string, CatalogProduct>;
  variants: ReadonlyMap<string, ProductVariant>;
  economics: ReadonlyMap<string, MerchantEconomics>;
  profiles: ReadonlyMap<string, ProductProfile>;
  compatibilityRules: readonly ProductCompatibilityRule[];
  bundleComponents: readonly BundleComponent[];
  profitPolicy: ProfitPolicyConfig;
  discountPolicy: DiscountPolicyConfig;
}
