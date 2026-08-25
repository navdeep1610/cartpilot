import { spawn } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(process.cwd());
const nextCli = resolve(projectRoot, "node_modules/next/dist/bin/next");
const openNextCli = resolve(projectRoot, "node_modules/@opennextjs/cloudflare/dist/cli/index.js");

await run(nextCli, ["build"]);
await run(openNextCli, ["build", "--skipNextBuild"]);
await import("./prepare-sites-build.mjs");

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Build command failed (${signal || code}): ${script} ${args.join(" ")}`));
    });
  });
}
