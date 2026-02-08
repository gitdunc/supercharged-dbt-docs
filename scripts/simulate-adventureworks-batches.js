#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const BATCHES = ["am", "pm"];
const DEFAULT_DAYS = 3;
const DEFAULT_START_DATE = "2026-02-03";
const DEFAULT_OUTPUT_DIR = "samples/adventureworks-batches";
const TRANSACTION_TARGET_TABLE_COUNT = 12;
const REFERENCE_TARGET_TABLE_COUNT = 4;

const HARDCODED_REFERENCE_TABLE_NAMES = new Set([
  "addresstype",
  "contacttype",
  "countryregion",
  "creditcard",
  "currency",
  "currencyrate",
  "phonenumbertype",
  "salesreason",
  "salesterritory",
  "shipmethod",
  "specialoffer",
  "stateprovince",
  "unitmeasure",
  "productcategory",
  "productmodel",
  "productsubcategory",
]);

function parseArgs(argv) {
  const args = {
    days: DEFAULT_DAYS,
    startDate: DEFAULT_START_DATE,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--days" && argv[i + 1]) {
      args.days = Math.max(1, Number(argv[++i] || DEFAULT_DAYS));
    } else if (token === "--start-date" && argv[i + 1]) {
      args.startDate = argv[++i];
    } else if (token === "--output-dir" && argv[i + 1]) {
      args.outputDir = argv[++i];
    }
  }

  return args;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function extractNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
    return extractNumber(value.value);
  }
  return undefined;
}

function setStatValue(stat, numberValue) {
  if (stat && typeof stat === "object" && Object.prototype.hasOwnProperty.call(stat, "value")) {
    stat.value = String(numberValue);
    return;
  }
  return {
    id: "num_rows",
    label: "# Rows",
    value: String(numberValue),
    include: true,
    description: "Approximate count of rows in this table",
  };
}

function toDateAt(dateString, batch) {
  const suffix = batch === "am" ? "T08:00:00Z" : "T20:00:00Z";
  return new Date(`${dateString}${suffix}`);
}

function addDays(dateString, offset) {
  const dt = new Date(`${dateString}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

function pctDelta(base, pct) {
  const raw = Math.round(base * pct);
  if (raw === 0) return 1;
  return raw;
}

function hasKeyValueShape(columns) {
  const names = new Set(Object.keys(columns || {}).map(normalize));
  const pairs = [
    ["id", "name"],
    ["id", "description"],
    ["code", "name"],
    ["code", "description"],
    ["key", "value"],
    ["type", "description"],
    ["status", "description"],
  ];
  return pairs.some(([a, b]) => names.has(a) && names.has(b));
}

function isReferenceLike(node) {
  const name = normalize(node.name);
  const tags = Array.isArray(node.tags) ? node.tags.map(normalize) : [];
  const materialized = normalize(node?.config?.materialized || "");
  const meta = node.meta || {};

  if (node.resource_type === "seed" || materialized === "seed") return true;
  if (meta.reference_table === true || normalize(meta.reference_table) === "true") return true;
  if (normalize(meta.data_class) === "reference") return true;
  if (tags.some((t) => ["ref", "reference", "lookup", "static", "dimension"].includes(t))) {
    return true;
  }
  if (HARDCODED_REFERENCE_TABLE_NAMES.has(name)) return true;
  if (
    name.includes("lookup") ||
    name.includes("reference") ||
    name.endsWith("_type") ||
    name.endsWith("_reason")
  ) {
    return true;
  }
  if (hasKeyValueShape(node.columns)) return true;

  return false;
}

function pickTransactionIds(ids, manifest) {
  return ids.filter((id) => {
    const node = manifest.nodes?.[id] || manifest.sources?.[id];
    if (!node) return false;
    return !isReferenceLike(node);
  });
}

function pickReferenceIds(ids, manifest) {
  return ids.filter((id) => {
    const node = manifest.nodes?.[id] || manifest.sources?.[id];
    if (!node) return false;
    return isReferenceLike(node);
  });
}

function selectTargetIds(ids, manifest) {
  const transactionCandidates = pickTransactionIds(ids, manifest).sort();
  const referenceCandidates = pickReferenceIds(ids, manifest).sort();
  return {
    transactionTargetIds: transactionCandidates.slice(0, TRANSACTION_TARGET_TABLE_COUNT),
    referenceTargetIds: referenceCandidates.slice(0, REFERENCE_TARGET_TABLE_COUNT),
  };
}

function applySchemaDrift(batchIndex, batchLabel, manifest, catalog, candidateIds, summary) {
  // deterministic showcase events
  if (batchIndex === 1 && batchLabel === "pm" && candidateIds[0]) {
    const targetId = candidateIds[0];
    const node = manifest.nodes?.[targetId];
    const cNode = catalog.nodes?.[targetId];
    if (node) {
      if (!node.columns) node.columns = {};
      node.columns.pm_batch_flag = {
        description: "Simulated PM batch quality flag",
        data_type: "boolean",
      };
    }
    if (cNode) {
      if (!cNode.columns) cNode.columns = {};
      cNode.columns.pm_batch_flag = {
        type: "BOOLEAN",
        index: 9999,
        name: "pm_batch_flag",
        comment: "Simulated PM batch quality flag",
      };
    }
    summary.schemaEvents.push({
      type: "add_column",
      unique_id: targetId,
      column: "pm_batch_flag",
      batch: batchLabel,
    });
  }

  if (batchIndex === 2 && batchLabel === "am" && candidateIds[1]) {
    const targetId = candidateIds[1];
    const node = manifest.nodes?.[targetId];
    const cNode = catalog.nodes?.[targetId];
    const candidateColumn = Object.keys(node?.columns || {}).find((c) =>
      ["status", "name", "description", "modifieddate"].includes(normalize(c))
    );

    if (candidateColumn && cNode?.columns?.[candidateColumn]) {
      cNode.columns[candidateColumn].type = "VARCHAR";
      summary.schemaEvents.push({
        type: "change_type",
        unique_id: targetId,
        column: candidateColumn,
        to: "VARCHAR",
        batch: batchLabel,
      });
    }
  }
}

function updateNodeMetadata(node, batchTime, referenceData, changedInBatch) {
  if (!node.meta || typeof node.meta !== "object") {
    node.meta = {};
  }
  node.meta.reference_table = referenceData;
  node.meta.data_class = referenceData ? "reference" : "transactional";
  if (changedInBatch) {
    node.meta.last_updated_at = batchTime.toISOString();
  }
  node.meta.simulated_pipeline = referenceData
    ? "master_data_daily"
    : "transactional_intraday";
}

function buildSnapshot(baseManifest, baseCatalog, context) {
  const manifest = clone(baseManifest);
  const catalog = clone(baseCatalog);

  const allCatalogNodes = {
    ...(catalog.nodes || {}),
    ...(catalog.sources || {}),
  };

  const allManifestNodes = {
    ...(manifest.nodes || {}),
    ...(manifest.sources || {}),
  };

  const ids = Object.keys(allCatalogNodes).filter((id) => Boolean(allManifestNodes[id]));
  const targetIds = selectTargetIds(ids, manifest);
  const transactionTargetSet = new Set(targetIds.transactionTargetIds);
  const referenceTargetSet = new Set(targetIds.referenceTargetIds);
  const summary = {
    label: context.label,
    timestamp: context.batchTime.toISOString(),
    transactionTargetTableCount: targetIds.transactionTargetIds.length,
    referenceTargetTableCount: targetIds.referenceTargetIds.length,
    updatedTransactionTables: 0,
    updatedReferenceTables: 0,
    schemaEvents: [],
    rowCountChanges: [],
  };

  for (const id of ids) {
    const mNode = allManifestNodes[id];
    const cNode = allCatalogNodes[id];
    const isReference = isReferenceLike(mNode);
    const isTargetReference = referenceTargetSet.has(id);
    const isTargetTransaction = transactionTargetSet.has(id);

    const currentRows = extractNumber(cNode?.stats?.num_rows) || 0;
    let nextRows = currentRows;
    let changed = false;

    if (isReference && isTargetReference) {
      // Slow-changing reference tables: AM update every other day.
      if (context.batch === "am" && context.dayIndex % 2 === 0) {
        const delta = pctDelta(Math.max(1, currentRows), 0.0025);
        nextRows = currentRows + delta;
        changed = true;
      }
    } else if (!isReference && isTargetTransaction) {
      // Targeted transactional tables: AM+PM updates, PM larger.
      const pct = context.batch === "am" ? 0.0125 : 0.035;
      const delta = pctDelta(Math.max(1, currentRows), pct);
      nextRows = currentRows + delta;
      changed = true;
    }

    if (changed) {
      summary.rowCountChanges.push({
        unique_id: id,
        previous: currentRows,
        current: nextRows,
        delta: nextRows - currentRows,
      });
      if (isReference) {
        summary.updatedReferenceTables += 1;
      } else {
        summary.updatedTransactionTables += 1;
      }
    }

    if (!cNode.stats) cNode.stats = {};
    if (!cNode.stats.num_rows) {
      cNode.stats.num_rows = setStatValue(null, nextRows);
    } else {
      setStatValue(cNode.stats.num_rows, nextRows);
    }

    updateNodeMetadata(mNode, context.batchTime, isReference, changed);
    if (!Array.isArray(mNode.tags)) {
      mNode.tags = [];
    }
    if (isReference && !mNode.tags.includes("reference")) {
      mNode.tags.push("reference");
    }
    if (!isReference && !mNode.tags.includes("transactional")) {
      mNode.tags.push("transactional");
    }
  }

  applySchemaDrift(
    context.dayIndex,
    context.batch,
    manifest,
    catalog,
    targetIds.transactionTargetIds,
    summary
  );

  if (!manifest.metadata) manifest.metadata = {};
  if (!catalog.metadata) catalog.metadata = {};
  manifest.metadata.generated_at = context.batchTime.toISOString();
  catalog.metadata.generated_at = context.batchTime.toISOString();

  summary.rowCountChanges = summary.rowCountChanges
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 25);

  return { manifest, catalog, summary };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeReadme(filePath, index) {
  const lines = [
    "# AdventureWorks Batch Simulation",
    "",
    `Generated at: ${index.generated_at}`,
    "",
    "Default scenario:",
    `- Start date: ${index.start_date}`,
    `- Days: ${index.days}`,
    `- Batches: ${index.batches.length} (AM/PM)`,
    "- Artifacts per batch: manifest.json + catalog.json + summary.json",
    "",
    "Expected behavior:",
    "- Only a small targeted subset of tables changes each batch.",
    "- Transactional targets update every AM/PM batch (PM larger deltas).",
    "- Reference targets update slowly (AM only, every other day).",
    "- Deterministic schema drift demo:",
    "  - Day 2 PM: one transactional table adds `pm_batch_flag`.",
    "  - Day 3 AM: one transactional column type changes to `VARCHAR`.",
    "",
    "Batch index:",
  ];

  for (const batch of index.batches) {
    lines.push(
      `- ${batch.label}: tx-updated=${batch.updatedTransactionTables}, ref-updated=${batch.updatedReferenceTables}, schema-events=${batch.schemaEvents}`
    );
  }

  lines.push("");
  lines.push("Use this snapshot:");
  lines.push("```bash");
  lines.push("npm run use:snapshot -- <batch-label>");
  lines.push("```");
  lines.push("");

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const manifestPath = path.join(root, "manifest.json");
  const catalogPath = path.join(root, "catalog.json");

  if (!fs.existsSync(manifestPath) || !fs.existsSync(catalogPath)) {
    console.error("manifest.json and catalog.json must exist in project root.");
    process.exit(1);
  }

  const baseManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const baseCatalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));

  const outputDir = path.join(root, args.outputDir);
  ensureDir(outputDir);

  const index = {
    generated_at: new Date().toISOString(),
    description:
      "AdventureWorks AM/PM batch simulation for lineage + observability demos.",
    start_date: args.startDate,
    days: args.days,
    batches: [],
  };

  for (let dayIndex = 0; dayIndex < args.days; dayIndex++) {
    const date = addDays(args.startDate, dayIndex);
    for (const batch of BATCHES) {
      const label = `${date}-${batch}`;
      const batchTime = toDateAt(date, batch);
      const snapshotDir = path.join(outputDir, label);
      ensureDir(snapshotDir);

      const result = buildSnapshot(baseManifest, baseCatalog, {
        dayIndex,
        date,
        batch,
        label,
        batchTime,
      });

      writeJson(path.join(snapshotDir, "manifest.json"), result.manifest);
      writeJson(path.join(snapshotDir, "catalog.json"), result.catalog);
      writeJson(path.join(snapshotDir, "summary.json"), result.summary);

      index.batches.push({
        label,
        path: path.relative(root, snapshotDir).replace(/\\/g, "/"),
        timestamp: batchTime.toISOString(),
        updatedTransactionTables: result.summary.updatedTransactionTables,
        updatedReferenceTables: result.summary.updatedReferenceTables,
        schemaEvents: result.summary.schemaEvents.length,
      });
    }
  }

  writeJson(path.join(outputDir, "index.json"), index);
  writeReadme(path.join(outputDir, "README.md"), index);

  console.log(
    `Generated ${index.batches.length} snapshots in ${path.relative(root, outputDir)}`
  );
}

main();
