import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const requiredFiles = [
  ".github/workflows/ci.yml",
  ".env.example",
  "DEPLOYMENT_GUIDE.md",
  "HACKATHON_REQUIREMENTS.md",
  "README.md",
  "submission/DEMO_SCRIPT.md",
  "submission/RELEASE_CHECKLIST.md",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`Required release artifact is missing: ${file}`);
}

const trackedFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);

const jsonFiles = trackedFiles.filter((file) => file.endsWith(".json"));
for (const file of jsonFiles) JSON.parse(readFileSync(file, "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const schemaFiles = trackedFiles.filter((file) => file.startsWith("schemas/") && file.endsWith(".json"));
for (const file of schemaFiles) {
  const schema = JSON.parse(readFileSync(file, "utf8"));
  if (!ajv.validateSchema(schema)) {
    throw new Error(`JSON Schema meta-validation failed: ${file}`);
  }
}

const manifest = JSON.parse(readFileSync("catalog/catalog_manifest.json", "utf8"));
const resources = [
  ...manifest.catalog_resources,
  ...manifest.schema_resources,
  ...manifest.governance_resources,
];
for (const resource of resources) {
  if (!existsSync(resource.path)) {
    if (resource.required === false) continue;
    throw new Error(`Manifest resource is missing: ${resource.resource_id}`);
  }
  const digest = createHash("sha256").update(readFileSync(resource.path)).digest("hex");
  if (digest !== resource.sha256) throw new Error(`Manifest checksum failed: ${resource.resource_id}`);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (!String(packageJson.engines?.node ?? "").includes("24")) throw new Error("Node.js 24 must remain pinned for releases");
if (packageJson.dependencies?.next !== "16.3.0") throw new Error("The reviewed Next.js release changed without an explicit update");
if (packageJson.dependencies?.razorpay !== "2.9.8") throw new Error("The reviewed Razorpay SDK release changed without an explicit update");

const publicEnvNames = readFileSync(".env.example", "utf8")
  .split(/\r?\n/)
  .filter((line) => line.startsWith("NEXT_PUBLIC_"))
  .map((line) => line.split("=", 1)[0]);
const forbiddenPublicNames = publicEnvNames.filter((name) => /SECRET|PRIVATE|SERVICE_ROLE|GEMINI|RAZORPAY_KEY/i.test(name));
if (forbiddenPublicNames.length > 0) throw new Error(`Private configuration exposed as public: ${forbiddenPublicNames.join(", ")}`);

console.log(
  `Release contracts passed: ${jsonFiles.length} JSON files, ${schemaFiles.length} schemas, ${resources.length} manifest resources.`,
);
