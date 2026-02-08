#!/usr/bin/env node
/**
 * Validate generated DAG files for correctness and performance.
 * Usage: node scripts/validate-dags.js [optional-limit-to-check]
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'dag');

function validateDagFile(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const errors = [];
    const warnings = [];

    // Check required fields
    if (!Array.isArray(data.nodes)) errors.push('Missing nodes array');
    if (!Array.isArray(data.edges)) errors.push('Missing edges array');
    if (!data.source) errors.push('Missing source field');
    if (data.generated_at === undefined) warnings.push('Missing generated_at timestamp');

    // Validate node structure
    data.nodes?.forEach((node, idx) => {
      if (!node.id) errors.push(`Node ${idx}: missing id`);
      if (!node.label) warnings.push(`Node ${idx}: missing label`);
    });

    // Validate edge structure and consistency
    const nodeIds = new Set(data.nodes?.map((n) => n.id) || []);
    data.edges?.forEach((edge, idx) => {
      if (!edge.from) errors.push(`Edge ${idx}: missing from`);
      if (!edge.to) errors.push(`Edge ${idx}: missing to`);
      if (edge.from && !nodeIds.has(edge.from)) errors.push(`Edge ${idx}: from node "${edge.from}" not found`);
      if (edge.to && !nodeIds.has(edge.to)) errors.push(`Edge ${idx}: to node "${edge.to}" not found`);
    });

    return { valid: errors.length === 0, errors, warnings, nodeCount: data.nodes?.length || 0, edgeCount: data.edges?.length || 0 };
  } catch (e) {
    return { valid: false, errors: [e.message], warnings: [], nodeCount: 0, edgeCount: 0 };
  }
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error('DAG output directory not found:', OUT_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('No DAG files found. Run: node scripts/generate-dags.js');
    return;
  }

  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  const filesToCheck = files.slice(0, limit);

  console.log(`\nValidating ${filesToCheck.length} of ${files.length} DAG files...\n`);

  let validCount = 0;
  let totalNodes = 0;
  let totalEdges = 0;
  const errorSummary = {};

  filesToCheck.forEach((file) => {
    const result = validateDagFile(path.join(OUT_DIR, file));
    totalNodes += result.nodeCount;
    totalEdges += result.edgeCount;

    if (result.valid) {
      validCount++;
      process.stdout.write('.');
    } else {
      process.stdout.write('X');
      result.errors.forEach((err) => {
        errorSummary[err] = (errorSummary[err] || 0) + 1;
      });
    }

    if (result.warnings.length) {
      result.warnings.forEach((w) => console.warn(`  ⚠️  ${file}: ${w}`));
    }
  });

  console.log(`\n\n✓ Summary:\n  Valid: ${validCount} / ${filesToCheck.length}\n  Total nodes: ${totalNodes}\n  Total edges: ${totalEdges}`);

  if (Object.keys(errorSummary).length) {
    console.log('\n✗ Common errors:');
    Object.entries(errorSummary).forEach(([err, count]) => {
      console.log(`  - ${err} (${count} files)`);
    });
    process.exit(1);
  }

  console.log('\n✓ All validations passed!');
}

if (require.main === module) main();
