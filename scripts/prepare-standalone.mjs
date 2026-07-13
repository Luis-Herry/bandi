import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");

if (!existsSync(standaloneDir)) {
  throw new Error("Missing .next/standalone. Run `npm run build` first.");
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const sourcePath = path.join(src, entry.name);
    const targetPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile()) {
      mkdirSync(path.dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
      continue;
    }
    if (entry.isSymbolicLink()) {
      const real = statSync(sourcePath);
      if (real.isDirectory()) copyDir(sourcePath, targetPath);
      if (real.isFile()) copyFileSync(sourcePath, targetPath);
    }
  }
}

function assertNoLinkPath(base, target) {
  const relativeTarget = path.relative(base, target);
  if (
    !relativeTarget ||
    relativeTarget.startsWith("..") ||
    path.isAbsolute(relativeTarget)
  ) {
    throw new Error(`Unsafe standalone mirror target: ${target}`);
  }
  let current = base;
  if (lstatSync(current).isSymbolicLink()) {
    throw new Error(`Refusing to mirror through a link or junction: ${current}`);
  }
  for (const segment of relativeTarget.split(path.sep)) {
    current = path.join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`Refusing to mirror through a link or junction: ${current}`);
    }
  }
}

function mirrorDir(src, dest) {
  const relativeTarget = path.relative(standaloneDir, dest);
  if (
    !relativeTarget ||
    relativeTarget.startsWith("..") ||
    path.isAbsolute(relativeTarget)
  ) {
    throw new Error(`Unsafe standalone mirror target: ${dest}`);
  }
  assertNoLinkPath(root, dest);
  rmSync(dest, { recursive: true, force: true });
  if (existsSync(src)) copyDir(src, dest);
}

function removeStandaloneDir(target) {
  const relativeTarget = path.relative(standaloneDir, target);
  if (
    !relativeTarget ||
    relativeTarget.startsWith("..") ||
    path.isAbsolute(relativeTarget)
  ) {
    throw new Error(`Unsafe standalone cleanup target: ${target}`);
  }
  assertNoLinkPath(root, target);
  rmSync(target, { recursive: true, force: true });
}

removeStandaloneDir(path.join(standaloneDir, ".next", "cache"));
mirrorDir(staticDir, path.join(standaloneDir, ".next", "static"));
mirrorDir(publicDir, path.join(standaloneDir, "public"));

console.log("[desktop] standalone assets prepared");
