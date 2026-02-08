#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist"]);
const TARGET_FILE_PATTERN = /^manifest.*\.json$/i;

const REGULATED_PATTERNS = [
  /\bssn\b/,
  /social[_ -]?security/,
  /tax[_ -]?id/,
  /passport/,
  /driver[_ -]?licen[sc]e/,
  /card[_ -]?number/,
  /\bcvv\b/,
  /security[_ -]?code/,
  /iban/,
  /swift/,
];

const DIRECT_PII_PATTERNS = [
  /first[_ -]?name/,
  /last[_ -]?name/,
  /middle[_ -]?name/,
  /full[_ -]?name/,
  /email/,
  /phone/,
  /address/,
  /national[_ -]?id/,
  /login[_ -]?id/,
  /password/,
  /credit[_ -]?card[_ -]?approval[_ -]?code/,
  /\bdob\b/,
  /birth[_ -]?date/,
];

const PERSONAL_DATA_PATTERNS = [
  /person/,
  /employee/,
  /customer/,
  /salesperson/,
  /contact/,
  /account[_ -]?number/,
  /businessentity/,
  /email/,
  /phone/,
  /address/,
];

function collectTargetFiles(dirPath, out = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectTargetFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && TARGET_FILE_PATTERN.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyColumn(node, columnName) {
  const nodeContext = normalize(
    [
      node.unique_id,
      node.name,
      node.resource_type,
      node.schema,
      node.database,
      node.package_name,
      node.original_file_path,
      node.path,
    ].join(" ")
  );
  const col = normalize(columnName);
  const combined = `${nodeContext} ${col}`.trim();

  const regulated = hasAnyPattern(combined, REGULATED_PATTERNS);

  const directPii =
    regulated ||
    hasAnyPattern(col, DIRECT_PII_PATTERNS) ||
    (/\bname\b/.test(col) && hasAnyPattern(nodeContext, PERSONAL_DATA_PATTERNS));

  const personalData =
    directPii ||
    hasAnyPattern(combined, PERSONAL_DATA_PATTERNS) ||
    (/\bid\b/.test(col) && hasAnyPattern(nodeContext, PERSONAL_DATA_PATTERNS));

  const protectedInformation = regulated || directPii || personalData;

  let classification = "internal";
  if (regulated) classification = "regulated";
  else if (personalData || directPii) classification = "sensitive";

  return {
    classification,
    regulated,
    directPii,
    personalData,
    protectedInformation,
  };
}

function normalizeTags(existing) {
  const values = Array.isArray(existing) ? existing : [];
  return values.map((v) => String(v)).filter(Boolean);
}

function mergeTags(existing, additions) {
  const base = normalizeTags(existing).filter(
    (tag) =>
      !tag.startsWith("classification:") &&
      !["pi", "pd", "pii", "regulated", "hipaa:none"].includes(tag)
  );
  const merged = [...base, ...additions];
  return [...new Set(merged)];
}

function applyToManifest(doc) {
  const sections = [
    "nodes",
    "sources",
    "snapshots",
    "seeds",
    "tests",
    "analyses",
    "macros",
    "operations",
    "exposures",
    "metrics",
  ];
  let changed = 0;

  for (const section of sections) {
    const container = doc[section];
    if (!container || typeof container !== "object" || Array.isArray(container)) continue;

    for (const key of Object.keys(container)) {
      const node = container[key];
      if (!node || typeof node !== "object") continue;
      const columns = node.columns;
      if (!columns || typeof columns !== "object" || Array.isArray(columns)) continue;

      for (const columnName of Object.keys(columns)) {
        const column = columns[columnName];
        if (!column || typeof column !== "object") continue;
        if (!column.meta || typeof column.meta !== "object" || Array.isArray(column.meta)) {
          column.meta = {};
        }

        const result = classifyColumn(node, columnName);
        const desiredTags = [`classification:${result.classification}`];
        if (result.protectedInformation) desiredTags.push("pi");
        if (result.personalData) desiredTags.push("pd");
        if (result.directPii) desiredTags.push("pii");
        if (result.regulated) desiredTags.push("regulated");
        desiredTags.push("hipaa:none");

        const updates = {
          data_classification: result.classification,
          protected_information: result.protectedInformation,
          personal_data: result.personalData,
          personally_identifiable_information: result.directPii,
          regulated_data: result.regulated,
          hipaa_applicable: false,
          classification_standard: "Featherweight-4-Level-v1",
        };

        for (const [metaKey, metaValue] of Object.entries(updates)) {
          if (column.meta[metaKey] !== metaValue) {
            column.meta[metaKey] = metaValue;
            changed++;
          }
        }

        const mergedTags = mergeTags(column.tags, desiredTags);
        if (JSON.stringify(mergedTags) !== JSON.stringify(normalizeTags(column.tags))) {
          column.tags = mergedTags;
          changed++;
        }
      }
    }
  }

  return changed;
}

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const doc = JSON.parse(raw);
  const changed = applyToManifest(doc);
  if (changed > 0) {
    fs.writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  }
  return changed;
}

function main() {
  const files = collectTargetFiles(ROOT).sort();
  if (files.length === 0) {
    console.log("No manifest files found.");
    return;
  }

  let changedFiles = 0;
  let changedFields = 0;
  for (const filePath of files) {
    const changed = processFile(filePath);
    if (changed > 0) {
      changedFiles++;
      changedFields += changed;
      console.log(`[updated] ${path.relative(ROOT, filePath)} (${changed} field updates)`);
    }
  }

  console.log("");
  console.log(`Processed ${files.length} manifest files.`);
  console.log(`Updated ${changedFiles} files (${changedFields} classification fields).`);
}

main();
