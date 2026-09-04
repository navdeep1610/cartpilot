import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { CatalogIntegrityMetadata } from "@/domain/catalog/types";

interface ManifestResource {
  resource_id: string;
  path: string;
  format: string;
  version?: string;
  required?: boolean;
  row_count?: number | null;
  columns?: string[];
  sha256: string;
  schema_id?: string;
  expected_identity?: Record<string, unknown>;
}

export interface CatalogManifest {
  manifest_id: string;
  manifest_version: string;
  catalog_version: string;
  expected_snapshot: Record<string, unknown>;
  catalog_resources: ManifestResource[];
  schema_resources: ManifestResource[];
  governance_resources: ManifestResource[];
}

export interface ValidatedManifest {
  manifest: CatalogManifest;
  integrity: CatalogIntegrityMetadata;
}

export async function validateCatalogManifest(
  rootDirectory: string,
  manifestSource: string,
): Promise<ValidatedManifest> {
  const manifest = JSON.parse(manifestSource) as CatalogManifest;
  if (
    manifest.manifest_id !== "CARTPILOT-CATALOG-MANIFEST" ||
    !manifest.manifest_version ||
    !manifest.catalog_version
  ) {
    throw new Error("Catalog manifest identity is invalid");
  }

  const resources = [
    ...requiredArray(manifest.catalog_resources, "catalog_resources"),
    ...requiredArray(manifest.schema_resources, "schema_resources"),
    ...requiredArray(manifest.governance_resources, "governance_resources"),
  ];
  const resourceHashes: Record<string, string> = {};
  const resourceVersions: Record<string, string> = {};
  const schemaVersions: Record<string, string> = {};
  const seenResourceIds = new Set<string>();

  for (const resource of resources) {
    if (!resource.resource_id || seenResourceIds.has(resource.resource_id)) {
      throw new Error(`Duplicate or missing manifest resource identity: ${resource.resource_id || "unknown"}`);
    }
    seenResourceIds.add(resource.resource_id);
    const resourcePath = resolveResourcePath(rootDirectory, resource.path);
    let source: Buffer;
    try {
      source = await readFile(resourcePath);
    } catch (error) {
      if (resource.required === false) continue;
      throw new Error(`Required manifest resource is unavailable: ${resource.resource_id}`, { cause: error });
    }

    const hash = sha256(source);
    if (hash !== resource.sha256) {
      throw new Error(`Manifest checksum mismatch for ${resource.resource_id}`);
    }
    resourceHashes[resource.resource_id] = hash;
    if (resource.version) resourceVersions[resource.resource_id] = resource.version;

    if (resource.format.startsWith("csv_")) {
      validateCsvResource(resource, source);
    } else if (resource.format.includes("json")) {
      const parsed = JSON.parse(source.toString("utf8")) as Record<string, unknown>;
      validateJsonIdentity(resource, parsed);
      if (resource.schema_id) {
        const schemaVersion = schemaVersionFrom(parsed);
        if (parsed.$id !== resource.schema_id || schemaVersion !== resource.version) {
          throw new Error(`Schema identity mismatch for ${resource.resource_id}`);
        }
        if (schemaVersion) schemaVersions[resource.resource_id] = schemaVersion;
      }
    }
  }

  return {
    manifest,
    integrity: {
      manifestVersion: manifest.manifest_version,
      manifestHash: sha256(Buffer.from(manifestSource, "utf8")),
      loadedAt: new Date().toISOString(),
      resourceHashes: Object.freeze(resourceHashes),
      resourceVersions: Object.freeze(resourceVersions),
      schemaVersions: Object.freeze(schemaVersions),
      validationStatus: "valid",
    },
  };
}

function validateCsvResource(resource: ManifestResource, source: Buffer): void {
  const rows = parse(source, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as string[][];
  if (rows.length === 0) throw new Error(`CSV resource is empty: ${resource.resource_id}`);
  if (resource.columns && !arraysEqual(rows[0], resource.columns)) {
    throw new Error(`CSV header mismatch for ${resource.resource_id}`);
  }
  if (typeof resource.row_count === "number" && rows.length - 1 !== resource.row_count) {
    throw new Error(`CSV row-count mismatch for ${resource.resource_id}`);
  }
}

function validateJsonIdentity(resource: ManifestResource, parsed: Record<string, unknown>): void {
  if (resource.version && typeof parsed.version === "string" && parsed.version !== resource.version) {
    throw new Error(`JSON version mismatch for ${resource.resource_id}`);
  }
  for (const [key, expected] of Object.entries(resource.expected_identity ?? {})) {
    if (!Object.is(parsed[key], expected)) {
      throw new Error(`JSON identity mismatch for ${resource.resource_id}.${key}`);
    }
  }
}

function schemaVersionFrom(schema: Record<string, unknown>): string | null {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;
  const schemaVersion = (properties as Record<string, unknown>).schema_version;
  if (!schemaVersion || typeof schemaVersion !== "object" || Array.isArray(schemaVersion)) return null;
  const constant = (schemaVersion as Record<string, unknown>).const;
  return typeof constant === "string" ? constant : null;
}

function resolveResourcePath(rootDirectory: string, resourcePath: string): string {
  const root = path.resolve(rootDirectory);
  const resolved = path.resolve(rootDirectory, resourcePath.replaceAll("/", path.sep));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Manifest resource escapes the project root: ${resourcePath}`);
  }
  return resolved;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requiredArray<T>(value: T[] | undefined, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Catalog manifest is missing ${label}`);
  return value;
}
