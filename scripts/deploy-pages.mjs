import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = "https://line-ar-line.github.io/step-studio/";

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args[0]} failed (${result.status}).`);
}

function captureGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || "Git command failed.");
  return result.stdout.trim();
}

// Build locally; only dist/ is copied to the deployment branch.
run(process.execPath, ["scripts/copy-occt.mjs"]);
run(process.execPath, ["node_modules/typescript/bin/tsc", "-b"]);
run(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "build",
  "--base",
  "/step-studio/",
]);
const dist = join(root, "dist");
for (const file of [
  "index.html",
  "step-worker.js",
  "vendor/occt-import-js.js",
  "vendor/occt-import-js.wasm",
  "vendor/LICENSE-occt-import-js.md",
  "samples/support-assembly.step",
]) {
  if (!existsSync(join(dist, file)))
    throw new Error(`Missing deployment asset: ${file}`);
}

const remote = captureGit(["remote", "get-url", "origin"]);
if (
  !/^(?:https:\/\/github\.com\/|git@github\.com:)line-ar-line\/step-studio(?:\.git)?$/.test(
    remote,
  )
) {
  throw new Error(
    "This deployment script targets line-ar-line/step-studio. Update its repository and base path before using a fork.",
  );
}
const branch = spawnSync(
  "git",
  ["ls-remote", "--exit-code", "--heads", remote, "gh-pages"],
  { cwd: root, encoding: "utf8", shell: false },
);
if (branch.error) throw branch.error;
if (branch.status !== 0 && branch.status !== 2)
  throw new Error(branch.stderr || "Cannot read deployment branch.");

const temporaryRoot = mkdtempSync(join(tmpdir(), "step-studio-pages-"));
const checkout = join(temporaryRoot, "site");
try {
  if (branch.status === 0) {
    run("git", [
      "clone",
      "--single-branch",
      "--branch",
      "gh-pages",
      remote,
      checkout,
    ]);
  } else {
    run("git", ["clone", "--no-checkout", "--single-branch", remote, checkout]);
    run("git", ["switch", "--orphan", "gh-pages"], checkout);
  }
  // This is a new temporary clone; the user's source checkout is never cleared.
  for (const file of readdirSync(checkout)) {
    if (file !== ".git")
      rmSync(join(checkout, file), { recursive: true, force: true });
  }
  for (const file of readdirSync(dist))
    cpSync(join(dist, file), join(checkout, file), { recursive: true });
  writeFileSync(join(checkout, ".nojekyll"), "");
  run("git", ["add", "--all"], checkout);
  const changed = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd: checkout,
    shell: false,
  });
  if (changed.error) throw changed.error;
  if (changed.status === 1) {
    const source = captureGit(["rev-parse", "--short", "HEAD"]);
    run("git", ["commit", "-m", `Deploy STEP Studio from ${source}`], checkout);
    run("git", ["push", "origin", "gh-pages"], checkout);
  } else if (changed.status !== 0)
    throw new Error("Cannot inspect deployment changes.");
  console.log(`Pages assets published. GitHub will update ${destination}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
