import _ from "underscore";
import * as projectService from "@/app/projectService";
import { TableDetails } from "@/components/TableDetails";
import { ColumnDetails } from "@/components/ColumnDetails";
import { ReferenceList } from "@/components/ReferenceList";
import { CodeBlock } from "@/components/CodeBlock";
import { getReferences, getParents } from "@/util/dagUtils";
import React from "react";
import { SetActive } from "@/components/SetActive";
import { filterNodes } from "@/util/filterNodes";
import { generateSourceSQL } from "@/util/generateSourceSQL";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { GenerateDAG } from "@/components/GenerateDAG";
import { PersonaInlineFilters } from "@/components/PersonaInlineFilters";

export default async function SourcePage({
  params: { id },
}: {
  params: { id: string };
}) {
  await projectService.loadProject();
  const model = projectService.project.nodes[id];
  const references = getReferences(projectService.project, model);
  const referencesLength = Object.keys(references).length;

  const versions = {
    "Sample SQL": generateSourceSQL(model),
  };

  const extra_table_fields = [
    {
      name: "Loader",
      value: model.loader,
    },
    {
      name: "Source",
      value: model.source_name,
    },
  ];

  return (
    <div className="app-scroll">
      <SetActive uniqueId={id} />
      <div className="app-links app-sticky">
        <div className="app-title">
          <div className="app-frame app-pad app-flush-bottom">
            <h1>
              <span className="break">
                {model.source_name}.{model.name}
              </span>
              <small>source data table</small>
            </h1>
          </div>
        </div>
        <div
          className="app-frame app-pad-h"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "nowrap",
            overflowX: "auto",
          }}
        >
          <ul
            className="nav nav-tabs"
            style={{ flex: "1 1 auto", minWidth: 0, whiteSpace: "nowrap" }}
          >
            {/* Todo make nav links active or not */}
            <li data-persona-key="details">
              <a href="#details">Details</a>
            </li>
            <li data-persona-key="description">
              <a href="#description">Description</a>
            </li>
            <li data-persona-key="columns">
              <a href="#columns">Columns</a>
            </li>
            {referencesLength ? (
              <li data-persona-key="referenced_by">
                <a href="#referenced_by">Referenced By</a>
              </li>
            ) : null}
            <li data-persona-key="code">
              <a href="#code">SQL</a>
            </li>
            <li data-persona-key="dag">
              <a
                href={`/dag/${encodeURIComponent(id)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                DAG
              </a>
            </li>
          </ul>
          <PersonaInlineFilters />
        </div>
      </div>
      <div className="app-details">
        <div className="app-frame app-pad">
          <section className="section" data-persona-key="details">
            <div className="section-target" id="details"></div>
            <TableDetails model={model} extras={extra_table_fields} />           
          </section>

          <section className="section" data-persona-key="description">
            <div className="section-target" id="description"></div>
            <div className="section-content">
              <h6>Description</h6>
              <div className="panel">
                <div className="panel-body">
                  {model.description ? (
                    <div className="model-markdown">
                      <MarkdownBlock markdown={model.description} />
                    </div>
                  ) : (
                    <div>
                      This source data table is not currently documented
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
          <section className="section" data-persona-key="columns">
            <div className="section-target" id="columns"></div>
            <div className="section-content">
              <h6>Columns</h6>
              <ColumnDetails model={model} />
            </div>
          </section>
          {referencesLength ? (
            <section className="section" data-persona-key="referenced_by">
              <div className="section-target" id="referenced_by"></div>
              <div className="section-content">
                <h6>Referenced By</h6>
                <ReferenceList references={references} node={model} />
              </div>
            </section>
          ) : null}

          <section className="section" data-persona-key="code">
            <div className="section-target" id="code"></div>
            <div className="section-content">
              <CodeBlock
                versions={versions}
                defaultVersion={"Sample SQL"}
                language={"sql"}
              />
            </div>
          </section>

          <section className="section" data-persona-key="dag">
            <div className="section-target" id="dag"></div>
            <div className="section-content">
              <h6>Graph</h6>
              <GenerateDAG model={model} />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

export async function generateStaticParams() {
  return await filterNodes("source");
}
