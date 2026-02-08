"use client";

import React from "react";
import { PERSONA_VIEWS, PersonaId } from "../../config/personaLayout";

export function PersonaOverview() {
  const [activePersona, setActivePersona] = React.useState<PersonaId>(
    PERSONA_VIEWS[0].id
  );
  const activeView =
    PERSONA_VIEWS.find((view) => view.id === activePersona) || PERSONA_VIEWS[0];

  return (
    <div className="panel panel-default" style={{ marginBottom: "12px" }}>
      <div className="panel-body">
        <h4 style={{ marginTop: 0, marginBottom: "8px" }}>Persona Views</h4>
        <p style={{ marginBottom: "10px" }}>
          UI grouping only (no security boundary). Mapping is configurable in{" "}
          <code>config/personaLayout.ts</code>.
        </p>

        <div className="switches" style={{ marginTop: 0, marginBottom: "12px" }}>
          {PERSONA_VIEWS.map((view) => (
            <div className="switch" key={view.id}>
              <span
                className={`${
                  activePersona === view.id ? "active" : ""
                } switch-label btn btn-sm`}
                onClick={() => setActivePersona(view.id)}
              >
                {view.label}
              </span>
            </div>
          ))}
        </div>

        <p style={{ marginBottom: "10px" }}>
          <strong>{activeView.label}:</strong> {activeView.summary}
        </p>

        <div>
          {activeView.sections.map((section) => (
            <div key={section.title} style={{ marginBottom: "10px" }}>
              <h6 style={{ marginTop: 0, marginBottom: "3px" }}>{section.title}</h6>
              <div style={{ marginBottom: "3px" }}>{section.purpose}</div>
              <div>
                <small>
                  Examples: {section.examples.join(" | ")}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

