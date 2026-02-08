"use client";
import React, { useMemo } from "react";
import { getDAGClientConfig } from "../../config/dag";

const DAG_CONFIG = getDAGClientConfig();
const MAX_NODES = DAG_CONFIG.maxNodes;
const MAX_EDGES = DAG_CONFIG.maxEdges;

type DagNode = {
  id: string;
  label: string;
  title?: string;
  shape?: string;
  color?: string;
};

type DagEdge = {
  from: string;
  to: string;
  arrows?: string;
};

type DagGraph = {
  nodes: DagNode[];
  edges: DagEdge[];
  source: "manifest" | "empty";
  truncated: boolean;
};

function shortId(rawId: string) {
  const pieces = rawId.split(".");
  if (pieces.length >= 2) {
    return `${pieces[pieces.length - 2]}.${pieces[pieces.length - 1]}`;
  }
  return rawId;
}

function buildManifestGraph(model: any): DagGraph {
  if (!model || !model.unique_id) {
    return { nodes: [], edges: [], source: "empty", truncated: false };
  }

  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];
  const nodeIds = new Set<string>();
  let truncated = false;

  const addNode = (node: DagNode) => {
    if (nodeIds.has(node.id)) {
      return;
    }
    if (nodes.length >= MAX_NODES) {
      truncated = true;
      return;
    }
    nodeIds.add(node.id);
    nodes.push(node);
  };

  const addEdge = (from: string, to: string) => {
    if (edges.length >= MAX_EDGES) {
      truncated = true;
      return;
    }
    edges.push({ from, to, arrows: "to" });
  };

  const rootId = String(model.unique_id);
  const rootLabel =
    model.label ||
    (model.source_name && model.name
      ? `${model.source_name}.${model.name}`
      : model.name) ||
    shortId(rootId);

  addNode({
    id: rootId,
    label: rootLabel,
    title: model.description || rootLabel,
    shape: "box",
    color: "#0b5cad",
  });

  const upstream = Array.isArray(model?.depends_on?.nodes)
    ? model.depends_on.nodes
    : [];

  upstream.forEach((parentId: string) => {
    const normalizedParentId = String(parentId);

    addNode({
      id: normalizedParentId,
      label: shortId(normalizedParentId),
      title: normalizedParentId,
      shape: "dot",
      color: "#6c757d",
    });

    addEdge(normalizedParentId, rootId);
  });

  if (edges.length === 0) {
    return { nodes: [], edges: [], source: "empty", truncated: false };
  }

  return { nodes, edges, source: "manifest", truncated };
}

export const GenerateDAGClient = ({ model }: { model: any }) => {
  const graphData = useMemo(() => {
    return buildManifestGraph(model);
  }, [model]);

  if (!model || !model.unique_id) {
    return (
      <div className="panel">
        <div className="panel-body">No DAG data was found for this object.</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="panel">
        <div className="panel-body">
          <a
            href={`/dag/${encodeURIComponent(String(model.unique_id))}`}
            className="btn btn-primary"
          >
            Open DAG
          </a>
          <div className="help-block">
            DAG opens in a dedicated page using manifest/catalog runtime APIs.
            {graphData.nodes.length > 0 ? (
              <span>
                {" "}
                Preview lineage: {graphData.nodes.length} nodes, {graphData.edges.length} edges.
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {graphData.truncated ? (
        <div className="help-block">
          Graph was truncated to {MAX_NODES} nodes and {MAX_EDGES} edges for browser performance.
        </div>
      ) : null}

      <div className="help-block">
        DAG source: manifest lineage from model.depends_on and /api/dag/[id]
      </div>
    </div>
  );
};
