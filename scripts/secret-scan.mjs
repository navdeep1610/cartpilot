import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const projectRoot = process.cwd();
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: projectRoot,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const blockedTrackedFiles = files.filter(
  (file) => /(^|\/)\.env(\.|$)/.test(file) && file !== ".env.example",
);

const secretRules = [
  { id: "RAZORPAY_LIVE_KEY", pattern: /rzp_live_[A-Za-z0-9]{8,}/ },
  { id: "GOOGLE_API_KEY", pattern: /AIza[0-9A-Za-z_-]{30,}/ },
  { id: "GITHUB_TOKEN", pattern: /gh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}/ },
  { id: "OPENAI_API_KEY", pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { id: "SUPABASE_SECRET_KEY", pattern: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { id: "PRIVATE_KEY", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    id: "POPULATED_PRIVATE_ENV",
    pattern: /^(?:RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|SESSION_SECRET|AUDIT_HASH_PEPPER)=[^\s#][^\r\n]*$/m,
  },
];

const readableExtensions = new Set([
  ".csv", ".json", ".js", ".jsx", ".md", ".mjs", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const findings = blockedTrackedFiles.map((file) => ({ file, rule: "TRACKED_ENV_FILE" }));

for (const file of files) {
  const extension = file.includes(".") ? file.slice(file.lastIndexOf(".")) : "";
  if (!readableExtensions.has(extension) || statSync(file).size > 2_000_000) continue;
  const source = readFileSync(file, "utf8");
  for (const rule of secretRules) {
    if (rule.pattern.test(source)) findings.push({ file, rule: rule.id });
  }

  if (/^(?:public|evaluation|e2e\/fixtures)\//.test(file)) {
    if (/\b(?:card_?number|cvv|upi_?pin|bank_?otp|payment_?signature)\b/i.test(source)) {
      findings.push({ file, rule: "RAW_PAYMENT_CREDENTIAL_IN_PUBLIC_ARTIFACT" });
    }
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed. Values are intentionally omitted:");
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.rule}`);
  process.exit(1);
}

console.log(`Secret scan passed across ${files.length} repository files.`);
