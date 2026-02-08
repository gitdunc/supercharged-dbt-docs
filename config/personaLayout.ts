export type PersonaId =
  | "production_support"
  | "data_engineering"
  | "business_analyst";

export interface PersonaSection {
  title: string;
  purpose: string;
  examples: string[];
}

export interface PersonaView {
  id: PersonaId;
  label: string;
  summary: string;
  sections: PersonaSection[];
}

export type PersonaSectionKey =
  | "details"
  | "description"
  | "columns"
  | "referenced_by"
  | "depends_on"
  | "code"
  | "dag";

// Configurable persona-to-section mapping used by the home page.
export const PERSONA_VIEWS: PersonaView[] = [
  {
    id: "production_support",
    label: "Prod Support",
    summary: "Fast operational checks and incident triage.",
    sections: [
      {
        title: "Broad Checks",
        purpose: "Schema drift, volume drift, and freshness monitoring.",
        examples: ["Schema status", "Row-count deviation", "Freshness lag"],
      },
      {
        title: "Lineage Focus",
        purpose: "Follow impact paths quickly during incidents.",
        examples: ["Backward lineage", "Forward lineage", "Depth-limited blast radius"],
      },
    ],
  },
  {
    id: "data_engineering",
    label: "Data Engineering",
    summary: "Model development and dependency understanding.",
    sections: [
      {
        title: "Data In Motion",
        purpose: "Work on model relationships and transformation flow.",
        examples: ["Model DAG", "Tag filters", "Reference-data identification"],
      },
      {
        title: "Data Definition",
        purpose: "Inspect node metadata and related tests without cluttering lineage.",
        examples: ["Node details", "Tests list", "Ownership and tags"],
      },
    ],
  },
  {
    id: "business_analyst",
    label: "Business Analyst",
    summary: "Readable context for curated and landed datasets.",
    sections: [
      {
        title: "Landed Data",
        purpose: "Understand slower-changing, source-aligned datasets.",
        examples: ["Seed resources", "Reference datasets", "Refresh timing"],
      },
      {
        title: "Consumption Context",
        purpose: "Navigate descriptions, columns, and usage dependencies.",
        examples: ["Referenced by", "Depends on", "Search + tags"],
      },
    ],
  },
];

// Configurable section visibility mapping for detail pages.
// If any selected persona is mapped to a section, that section remains visible.
export const PERSONA_SECTION_VISIBILITY: Record<PersonaSectionKey, PersonaId[]> = {
  details: ["production_support", "data_engineering", "business_analyst"],
  description: ["data_engineering", "business_analyst"],
  columns: ["data_engineering", "business_analyst"],
  referenced_by: ["production_support", "data_engineering"],
  depends_on: ["production_support", "data_engineering"],
  code: ["data_engineering"],
  dag: ["production_support", "data_engineering"],
};
