#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const moduleBuiltin = require("module");

const repoRoot = path.resolve(__dirname, "..");
const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "coverage",
  "samples",
  "public",
]);

const builtins = new Set([
  ...moduleBuiltin.builtinModules,
  ...moduleBuiltin.builtinModules.map((m) => `node:${m}`),
]);

const importPatterns = [
  /import\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
  /import\s+["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  /export\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g,
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePackageName(specifier) {
  if (!specifier) return null;
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/")) {
    return null;
  }
  if (specifier.startsWith("node:")) return specifier;
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

function walk(dir, files) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (EXTENSIONS.has(ext)) {
      files.push(path.join(dir, entry.name));
    }
  }
}

function collectUsedPackages(files) {
  const used = new Set();
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of importPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const pkg = normalizePackageName(match[1]);
        if (pkg && !builtins.has(pkg)) {
          used.add(pkg);
        }
      }
    }
  }
  return used;
}

function collectPackageFiles(files) {
  const packageFiles = new Map();
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of importPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const pkg = normalizePackageName(match[1]);
        if (!pkg || builtins.has(pkg)) continue;
        if (!packageFiles.has(pkg)) packageFiles.set(pkg, new Set());
        packageFiles.get(pkg).add(file);
      }
    }
  }
  return packageFiles;
}

function collectUsedFromScripts(packageJson) {
  const scriptMap = {
    next: "next",
    eslint: "eslint",
    "ts-node": "ts-node",
    concurrently: "concurrently",
    quicktype: "quicktype",
  };
  const used = new Set();
  const scripts = packageJson.scripts || {};
  for (const scriptValue of Object.values(scripts)) {
    if (typeof scriptValue !== "string") continue;
    const segments = scriptValue.split(/\|\||&&|[|;]/g);
    for (const segment of segments) {
      const first = segment.trim().split(/\s+/)[0];
      if (!first) continue;
      const mapped = scriptMap[first];
      if (mapped) used.add(mapped);
    }
  }
  return used;
}

function run() {
  const strict = process.argv.includes("--strict");
  const packageJsonPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.error("package.json not found in current directory.");
    process.exit(1);
  }

  const packageJson = readJson(packageJsonPath);
  const dependencies = Object.keys(packageJson.dependencies || {});
  const devDependencies = Object.keys(packageJson.devDependencies || {});
  const declared = new Set([...dependencies, ...devDependencies]);

  const files = [];
  walk(path.join(repoRoot, "src"), files);
  walk(path.join(repoRoot, "scripts"), files);
  // Keep root configs in scan to catch framework/plugin usage.
  for (const rootFile of ["next.config.js", "next.config.mjs", "postcss.config.js", "tailwind.config.js"]) {
    const full = path.join(repoRoot, rootFile);
    if (fs.existsSync(full)) files.push(full);
  }

  const used = collectUsedPackages(files);
  const packageFiles = collectPackageFiles(files);
  const usedFromScripts = collectUsedFromScripts(packageJson);
  for (const p of usedFromScripts) used.add(p);

  const undeclared = [...used].filter((p) => !declared.has(p)).sort();
  const unusedDependencies = dependencies.filter((p) => !used.has(p)).sort();
  const unusedDevDependencies = devDependencies.filter((p) => !used.has(p)).sort();

  console.log("Dependency Audit");
  console.log(`- files_scanned: ${files.length}`);
  console.log(`- declared_dependencies: ${dependencies.length}`);
  console.log(`- declared_devDependencies: ${devDependencies.length}`);
  console.log(`- packages_used_in_code: ${used.size}`);

  console.log("\nLikely unused dependencies:");
  if (unusedDependencies.length === 0) console.log("- none");
  else unusedDependencies.forEach((p) => console.log(`- ${p}`));

  console.log("\nLikely unused devDependencies:");
  if (unusedDevDependencies.length === 0) console.log("- none");
  else unusedDevDependencies.forEach((p) => console.log(`- ${p}`));

  console.log("\nUsed but undeclared packages:");
  if (undeclared.length === 0) console.log("- none");
  else {
    undeclared.forEach((p) => {
      console.log(`- ${p}`);
      const refs = packageFiles.get(p);
      if (refs && refs.size > 0) {
        for (const file of refs) {
          console.log(`  - ${path.relative(repoRoot, file)}`);
        }
      }
    });
  }

  if (strict && (unusedDependencies.length > 0 || undeclared.length > 0)) {
    process.exit(2);
  }
}

run();
