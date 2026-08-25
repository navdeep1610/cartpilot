import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const projectRoot = resolve(process.cwd());
const openNextRoot = resolve(projectRoot, ".open-next");
const distRoot = resolve(projectRoot, "dist");
const serverRoot = resolve(distRoot, "server");
const clientRoot = resolve(distRoot, "client");

if (!distRoot.startsWith(`${projectRoot}${sep}`)) {
  throw new Error("Refusing to prepare a build outside the project directory.");
}

await stat(resolve(openNextRoot, "worker.js"));
await rm(distRoot, { recursive: true, force: true });
await mkdir(serverRoot, { recursive: true });

// Preserve OpenNext's relative imports while exposing the entrypoint expected by Sites.
await cp(openNextRoot, serverRoot, { recursive: true, dereference: true });
await cp(resolve(openNextRoot, "worker.js"), resolve(serverRoot, "index.js"));

try {
  await cp(resolve(openNextRoot, "assets"), clientRoot, { recursive: true, dereference: true });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("Prepared the Sites-compatible OpenNext build in dist/.");
