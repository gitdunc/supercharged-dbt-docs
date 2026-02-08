export interface ReferenceDataInput {
  unique_id?: string;
  name?: string;
  resource_type?: string;
  tags?: string[];
  meta?: Record<string, unknown>;
  config?: {
    materialized?: string;
    [key: string]: unknown;
  };
  columns?: Record<string, unknown> | string[];
}

export interface ReferenceDataClassification {
  isReferenceData: boolean;
  reason: string;
}

// dbt schema does not define a first-class "reference table" attribute.
// Schema-compatible places are `tags` and custom `meta`; this file adds
// a temporary hardcoded layer until metadata is populated consistently.
//
// Hardcoded allowlist for common slow-changing reference tables.
const HARDCODED_REFERENCE_TABLE_NAMES = new Set<string>([
  'addresstype',
  'contacttype',
  'countryregion',
  'creditcard',
  'currency',
  'currencyrate',
  'phonenumbertype',
  'salesreason',
  'salesterritory',
  'shipmethod',
  'specialoffer',
  'stateprovince',
  'unitmeasure',
  'productcategory',
  'productmodel',
  'productsubcategory',
]);

const REFERENCE_TAGS = new Set<string>([
  'ref',
  'reference',
  'lookup',
  'static',
  'dimension',
]);

const KEY_VALUE_COLUMN_PAIRS: Array<[string, string]> = [
  ['id', 'name'],
  ['id', 'description'],
  ['code', 'name'],
  ['code', 'description'],
  ['key', 'value'],
  ['type', 'description'],
  ['status', 'description'],
];

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function getColumnNames(columns: ReferenceDataInput['columns']): string[] {
  if (!columns) return [];
  if (Array.isArray(columns)) {
    return columns.map(normalize).filter(Boolean);
  }
  return Object.keys(columns).map(normalize).filter(Boolean);
}

function hasKeyValueShape(columnNames: string[]): boolean {
  const names = new Set(columnNames);
  for (const [a, b] of KEY_VALUE_COLUMN_PAIRS) {
    if (names.has(a) && names.has(b)) {
      return true;
    }
  }
  return false;
}

export function classifyReferenceData(input: ReferenceDataInput): ReferenceDataClassification {
  const uniqueId = normalize(input.unique_id);
  const name = normalize(input.name);
  const resourceType = normalize(input.resource_type);
  const materialized = normalize(input.config?.materialized);
  const tags = Array.isArray(input.tags) ? input.tags.map(normalize).filter(Boolean) : [];
  const meta = input.meta || {};
  const dataClass = normalize((meta as Record<string, unknown>).data_class);
  const refFlag = (meta as Record<string, unknown>).reference_table;
  const columns = getColumnNames(input.columns);

  if (refFlag === true || normalize(refFlag) === 'true') {
    return { isReferenceData: true, reason: 'meta.reference_table' };
  }

  if (dataClass === 'reference') {
    return { isReferenceData: true, reason: 'meta.data_class=reference' };
  }

  if (tags.some((tag) => REFERENCE_TAGS.has(tag))) {
    return { isReferenceData: true, reason: 'tag' };
  }

  if (resourceType === 'seed' || materialized === 'seed') {
    return { isReferenceData: true, reason: 'seed' };
  }

  if (HARDCODED_REFERENCE_TABLE_NAMES.has(name)) {
    return { isReferenceData: true, reason: 'hardcoded_table_name' };
  }

  if (name && uniqueId.endsWith(`.${name}`) && HARDCODED_REFERENCE_TABLE_NAMES.has(name)) {
    return { isReferenceData: true, reason: 'hardcoded_unique_id_suffix' };
  }

  if (
    name.includes('lookup') ||
    name.includes('reference') ||
    name.includes('_type') ||
    name.includes('_reason')
  ) {
    return { isReferenceData: true, reason: 'name_pattern' };
  }

  if (hasKeyValueShape(columns)) {
    return { isReferenceData: true, reason: 'key_value_columns' };
  }

  return { isReferenceData: false, reason: 'not_reference' };
}
