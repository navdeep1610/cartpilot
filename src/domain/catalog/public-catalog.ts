import type { CatalogSnapshot } from "@/domain/catalog/types";

export interface PublicCatalogVariant {
  variantId: string;
  size: string;
  pricePaise: number;
  currency: "INR";
  isDefault: boolean;
  inStock: boolean;
}

export interface PublicCatalogProduct {
  productId: string;
  productType: string;
  productName: string;
  startingPricePaise: number;
  sizesAvailable: string[];
  useCase: string;
  routineStep: string;
  supportedSkinTypes: string[];
  supportedConcerns: string[];
  customerWarning: string | null;
  variants: PublicCatalogVariant[];
}

export interface PublicCatalogResponse {
  catalogVersion: string;
  currency: "INR";
  products: PublicCatalogProduct[];
}

export function createPublicCatalog(snapshot: CatalogSnapshot): PublicCatalogResponse {
  const products = [...snapshot.products.values()]
    .filter((product) => product.status === "active")
    .map((product): PublicCatalogProduct => {
      const profile = snapshot.profiles.get(product.productId);
      const variants = [...snapshot.variants.values()]
        .filter((variant) => variant.productId === product.productId && variant.active)
        .sort(
          (left, right) =>
            Number(right.isDefault) - Number(left.isDefault) ||
            left.pricePaise - right.pricePaise ||
            left.variantId.localeCompare(right.variantId),
        )
        .map((variant) => ({
          variantId: variant.variantId,
          size: variant.size,
          pricePaise: variant.pricePaise,
          currency: variant.currency,
          isDefault: variant.isDefault,
          inStock: variant.stockQuantity > 0,
        }));

      return {
        productId: product.productId,
        productType: product.productType,
        productName: product.productName,
        startingPricePaise: product.startingPricePaise,
        sizesAvailable: product.sizesAvailable,
        useCase: product.useCase,
        routineStep: profile?.routineStep ?? "unknown",
        supportedSkinTypes: profile?.supportedSkinTypes ?? [],
        supportedConcerns: profile?.supportedConcerns ?? [],
        customerWarning: profile?.customerWarning || null,
        variants,
      };
    })
    .filter((product) => product.variants.length > 0)
    .sort(
      (left, right) =>
        left.productType.localeCompare(right.productType) ||
        left.productName.localeCompare(right.productName),
    );

  return { catalogVersion: snapshot.version, currency: "INR", products };
}
