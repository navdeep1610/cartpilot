import { spawn } from "node:child_process";

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

await run(["exec", "next", "build"]);
await run(["exec", "opennextjs-cloudflare", "build", "--skipNextBuild"]);
await import("./prepare-sites-build.mjs");

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(packageManager, args, { stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Build command failed (${signal || code}): pnpm ${args.join(" ")}`));
    });
  });
}
