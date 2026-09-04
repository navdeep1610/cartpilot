import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadCatalogSnapshot } from "./file-catalog-repository";
import { validateCatalogManifest } from "./manifest-validator";

describe("file catalog repository", () => {
  it("loads and validates every merchant catalog resource", async () => {
    const snapshot = await loadCatalogSnapshot();
    expect(snapshot.products.size).toBe(40);
    expect(snapshot.variants.size).toBe(74);
    expect(snapshot.economics.size).toBe(74);
    expect(snapshot.profiles.size).toBe(40);
    expect(snapshot.compatibilityRules).toHaveLength(96);
    expect(snapshot.bundleComponents).toHaveLength(15);
    expect(snapshot.profitPolicy.version).toBe("1.1.0");
    expect(snapshot.integrity.manifestVersion).toBe("1.1.0");
    expect(snapshot.integrity.validationStatus).toBe("valid");
    expect(snapshot.integrity.resourceHashes.product_compatibility).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.discountPolicy.version).toBe("1.0.0");
  });

  it("rejects a snapshot when a declared resource checksum does not match", async () => {
    const source = await readFile("catalog/catalog_manifest.json", "utf8");
    const manifest = JSON.parse(source) as {
      catalog_resources: Array<{ resource_id: string; sha256: string }>;
    };
    const productResource = manifest.catalog_resources.find(
      (resource) => resource.resource_id === "customer_catalog",
    );
    if (!productResource) throw new Error("Missing customer catalog manifest entry");
    productResource.sha256 = "0".repeat(64);

    await expect(validateCatalogManifest(process.cwd(), JSON.stringify(manifest))).rejects.toThrow(
      "Manifest checksum mismatch for customer_catalog",
    );
  });
});
