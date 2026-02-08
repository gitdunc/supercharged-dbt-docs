#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist"]);
const TARGET_FILE_PATTERN = /^(manifest.*|catalog.*)\.json$/i;

const DOMAIN_TO_OWNER = {
  hr: "Human Resources Data Owner",
  sales: "Sales Data Owner",
  procurement: "Procurement Data Owner",
  manufacturing: "Manufacturing Data Owner",
  master: "Master Data Owner",
  quality: "Data Quality Owner",
  platform: "Data Platform Owner",
  engineering: "Data Engineering Owner",
};

const DOMAIN_LABELS = {
  hr: "Human Resources",
  sales: "Sales",
  procurement: "Procurement",
  manufacturing: "Manufacturing",
  master: "Master Data",
  quality: "Data Quality",
  platform: "Platform",
  engineering: "Data Engineering",
};

const DOMAIN_RULES = [
  {
    domain: "quality",
    patterns: [
      /\bdata_quality\b/,
      /\bdq[_-]/,
      /\bschema[_-]?drift\b/,
      /\brecency\b/,
      /\bobservability\b/,
    ],
  },
  {
    domain: "platform",
    patterns: [
      /\bmacro\b/,
      /\broutine\b/,
      /\boperation\b/,
      /\bget_model_config\b/,
      /\bformat_model_config\b/,
      /\bgenerate_schema_name\b/,
      /\binformation_schema\b/,
      /\binfo_schema\b/,
      /\bdbo\b/,
    ],
  },
  {
    domain: "sales",
    patterns: [
      /\bsales\b/,
      /\bcustomer\b/,
      /\bstore\b/,
      /\bterritory\b/,
      /\bcreditcard\b/,
      /\bcurrencyrate\b/,
      /\bsalesorder\b/,
      /\bsalesreason\b/,
      /\bsalestax\b/,
      /\bspecialoffer\b/,
      /\bsalesperson\b/,
    ],
  },
  {
    domain: "procurement",
    patterns: [/\bpurchasing\b/, /\bvendor\b/, /\bpurchaseorder\b/, /\bshipmethod\b/],
  },
  {
    domain: "manufacturing",
    patterns: [
      /\bproduction\b/,
      /\bbuild\b/,
      /\bproduct\b/,
      /\bbillofmaterials\b/,
      /\bworkorder\b/,
      /\bscrapreason\b/,
      /\btransactionhistory\b/,
      /\billustration\b/,
    ],
  },
  {
    domain: "hr",
    patterns: [
      /\bhumanresources\b/,
      /\bemployee\b/,
      /\bdepartment\b/,
      /\bshift\b/,
      /\bjobcandidate\b/,
      /\bpayhistory\b/,
    ],
  },
  {
    domain: "master",
    patterns: [
      /\bperson\b/,
      /\baddress\b/,
      /\bcontact\b/,
      /\bphone\b/,
      /\bcountryregion\b/,
      /\bstateprovince\b/,
      /\bbusinessentity\b/,
      /\bemailaddress\b/,
      /\bpassword\b/,
      /\bcommon\b/,
    ],
  },
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

function asText(value) {
  return value === undefined || value === null ? "" : String(value);
}

function getDomainFromText(text) {
  const normalized = text.replace(/[^a-z0-9]+/g, " ").trim();
  for (const rule of DOMAIN_RULES) {
    if (rule.patterns.some((p) => p.test(text) || p.test(normalized))) {
      return rule.domain;
    }
  }
  return "engineering";
}

function inferOwnership(entry, fallbackText = "") {
  const metadata = entry && typeof entry === "object" ? entry.metadata || {} : {};
  const text = [
    asText(entry.unique_id),
    asText(entry.resource_type),
    asText(entry.name),
    asText(entry.alias),
    asText(entry.relation_name),
    asText(entry.original_file_path),
    asText(entry.path),
    asText(entry.package_name),
    asText(entry.schema),
    asText(entry.database),
    asText(metadata.name),
    asText(metadata.schema),
    asText(metadata.database),
    asText(metadata.type),
    asText(fallbackText),
  ]
    .join(" ")
    .toLowerCase();

  const domain = getDomainFromText(text);
  return {
    domain,
    owner: DOMAIN_TO_OWNER[domain] || DOMAIN_TO_OWNER.engineering,
    domainLabel: DOMAIN_LABELS[domain] || DOMAIN_LABELS.engineering,
  };
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function applyToManifest(doc, filePath) {
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
    const container = ensureObject(doc[section]);
    for (const key of Object.keys(container)) {
      const entry = container[key];
      if (!entry || typeof entry !== "object") continue;
      const ownership = inferOwnership(entry, filePath);

      entry.meta = ensureObject(entry.meta);
      if (entry.meta.owner !== ownership.owner) {
        entry.meta.owner = ownership.owner;
        changed++;
      }
      if (entry.meta.owner_domain !== ownership.domainLabel) {
        entry.meta.owner_domain = ownership.domainLabel;
        changed++;
      }

      if (entry.config && typeof entry.config === "object" && !Array.isArray(entry.config)) {
        if (entry.config.owner !== ownership.owner) {
          entry.config.owner = ownership.owner;
          changed++;
        }
      }
    }
  }

  return changed;
}

function applyToCatalog(doc, filePath) {
  const sections = ["nodes", "sources"];
  let changed = 0;

  for (const section of sections) {
    const container = ensureObject(doc[section]);
    for (const key of Object.keys(container)) {
      const entry = container[key];
      if (!entry || typeof entry !== "object") continue;
      const ownership = inferOwnership(entry, filePath);

      entry.metadata = ensureObject(entry.metadata);
      if (entry.metadata.owner !== ownership.owner) {
        entry.metadata.owner = ownership.owner;
        changed++;
      }
      if (entry.metadata.owner_domain !== ownership.domainLabel) {
        entry.metadata.owner_domain = ownership.domainLabel;
        changed++;
      }
    }
  }

  return changed;
}

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const doc = JSON.parse(raw);
  const name = path.basename(filePath).toLowerCase();
  const isManifest = name.startsWith("manifest");
  const isCatalog = name.startsWith("catalog");

  let changed = 0;
  if (isManifest) changed += applyToManifest(doc, filePath);
  if (isCatalog) changed += applyToCatalog(doc, filePath);

  if (changed > 0) {
    fs.writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  }

  return changed;
}

function main() {
  const files = collectTargetFiles(ROOT).sort();
  if (files.length === 0) {
    console.log("No manifest/catalog files found.");
    return;
  }

  let changedFiles = 0;
  let changedFields = 0;

  for (const filePath of files) {
    const changed = processFile(filePath);
    if (changed > 0) {
      changedFiles++;
      changedFields += changed;
      const relative = path.relative(ROOT, filePath);
      console.log(`[updated] ${relative} (${changed} field updates)`);
    }
  }

  console.log("");
  console.log(`Processed ${files.length} manifest/catalog files.`);
  console.log(`Updated ${changedFiles} files (${changedFields} owner fields).`);
}

main();
