import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
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

if (existsSync(staticDir)) {
  const targetStatic = path.join(standaloneDir, ".next", "static");
  mkdirSync(path.dirname(targetStatic), { recursive: true });
  copyDir(staticDir, targetStatic);
}

if (existsSync(publicDir)) {
  copyDir(publicDir, path.join(standaloneDir, "public"));
}

console.log("[desktop] standalone assets prepared");
