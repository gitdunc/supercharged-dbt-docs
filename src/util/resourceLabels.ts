const RESOURCE_TYPE_LABELS: Record<
  string,
  { singular: string; plural: string }
> = {
  model: { singular: "Data In Motion (Activity)", plural: "Data In Motion (Activity)" },
  seed: { singular: "Landed Data", plural: "Landed Data" },
  source: { singular: "Source Data", plural: "Source Data" },
  snapshot: {
    singular: "Data In Motion (Snapshot)",
    plural: "Data In Motion (Snapshot)",
  },
  test: { singular: "Test", plural: "Tests" },
  macro: { singular: "Routine", plural: "Routines" },
  metric: { singular: "Metric", plural: "Metrics" },
  exposure: { singular: "Exposure", plural: "Exposures" },
  analysis: { singular: "Analysis", plural: "Analyses" },
  operation: { singular: "Operation", plural: "Operations" },
};

function toTitle(input: string): string {
  return input
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getResourceTypeLabel(
  type: string | undefined,
  options?: { plural?: boolean; includeRaw?: boolean }
): string {
  const normalized = String(type || "").toLowerCase().trim();
  if (!normalized) return "Node";

  const mapping = RESOURCE_TYPE_LABELS[normalized];
  const label = mapping
    ? options?.plural
      ? mapping.plural
      : mapping.singular
    : options?.plural
      ? `${toTitle(normalized)}s`
      : toTitle(normalized);

  if (options?.includeRaw && label.toLowerCase() !== normalized) {
    return `${label} (${normalized})`;
  }

  return label;
}
