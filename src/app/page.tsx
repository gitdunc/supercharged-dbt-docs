import React, { Suspense } from "react";
import { PersonaOverview } from "@/components/PersonaOverview";

export default function Home() {
  return (
    <div className="app-details app-scroll app-pad">
      <div className="app-frame app-pad">
        <PersonaOverview />
        <div className="panel panel-default">
          <div className="panel-body">
            <h1 id="featherweight-governance-tool">Featherweight Governance Tool</h1>
            <div>
              <p>
                Lightweight lineage and data-governance exploration for metadata artifacts.
              </p>
              <p>
                Terminology: <strong>Data In Motion</strong> maps to <code>model</code>{" "}
                resources and <strong>Landed Data</strong> maps to <code>seed</code>{" "}
                resources.
              </p>
              <ul>
                <li>
                  Open a model or source from the left tree to inspect lineage.
                </li>
                <li>
                  Use the DAG view to apply filters for tags, reference data, and broad checks.
                </li>
                <li>
                  Compare current vs previous snapshots for schema, volume, and freshness deltas.
                </li>
                <li>
                  See project documentation for schema references and compatibility guidance.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
