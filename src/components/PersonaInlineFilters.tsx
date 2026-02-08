"use client";

import React from "react";
import {
  PERSONA_SECTION_VISIBILITY,
  PERSONA_VIEWS,
  type PersonaId,
  type PersonaSectionKey,
} from "../../config/personaLayout";

const STORAGE_KEY = "featherweight.persona.inline.selected";
const ALL_PERSONAS: PersonaId[] = PERSONA_VIEWS.map((p) => p.id);

function normalizeSelection(input: unknown): PersonaId[] {
  if (!Array.isArray(input)) return ALL_PERSONAS;
  const valid = new Set(ALL_PERSONAS);
  const selected = input.filter(
    (v): v is PersonaId => typeof v === "string" && valid.has(v as PersonaId)
  );
  return selected.length > 0 ? selected : ALL_PERSONAS;
}

function shouldShowSection(sectionKey: string, selected: PersonaId[]): boolean {
  const typedKey = sectionKey as PersonaSectionKey;
  const allowed = PERSONA_SECTION_VISIBILITY[typedKey] || ALL_PERSONAS;
  return allowed.some((persona) => selected.includes(persona));
}

function applySectionVisibility(selected: PersonaId[]) {
  const targets = document.querySelectorAll<HTMLElement>("[data-persona-key]");
  targets.forEach((el) => {
    const key = el.dataset.personaKey || "";
    const visible = shouldShowSection(key, selected);
    if (visible) {
      el.style.display = "";
      el.removeAttribute("hidden");
      el.setAttribute("aria-hidden", "false");
    } else {
      el.style.display = "none";
      el.setAttribute("hidden", "");
      el.setAttribute("aria-hidden", "true");
    }
  });
}

export function PersonaInlineFilters() {
  const [selected, setSelected] = React.useState<PersonaId[]>(ALL_PERSONAS);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      setSelected(normalizeSelection(JSON.parse(raw)));
    } catch {
      setSelected(ALL_PERSONAS);
    }
  }, []);

  React.useEffect(() => {
    const raf = window.requestAnimationFrame(() => applySectionVisibility(selected));
    return () => {
      window.cancelAnimationFrame(raf);
      const targets = document.querySelectorAll<HTMLElement>("[data-persona-key]");
      targets.forEach((el) => {
        el.style.display = "";
        el.removeAttribute("hidden");
        el.removeAttribute("aria-hidden");
      });
    };
  }, [selected]);

  const toggle = (id: PersonaId) => {
    setSelected((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((v) => v !== id) : [...prev, id];
      const normalized = next.length > 0 ? next : ALL_PERSONAS;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore storage errors
      }
      return normalized;
    });
  };

  return (
    <div
      aria-label="Persona visibility filters"
      style={{
        flex: "0 0 auto",
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        whiteSpace: "nowrap",
        color: "rgb(84, 93, 101)",
        fontSize: "12px",
      }}
    >
      <span style={{ fontWeight: 600, color: "rgb(64, 72, 80)" }}>Personas</span>
      {PERSONA_VIEWS.map((persona) => (
        <label
          key={persona.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            margin: 0,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={selected.includes(persona.id)}
            onChange={() => toggle(persona.id)}
            style={{ margin: 0 }}
          />
          <span>{persona.label}</span>
        </label>
      ))}
    </div>
  );
}
