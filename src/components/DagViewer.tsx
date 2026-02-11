"use client";
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useDAG } from "@/hooks/useDAG";
import { useRouter, useSearchParams } from "next/navigation";
import { getResourceTypeLabel } from "@/util/resourceLabels";

const Graph = dynamic(() => import("react-graph-vis"), { ssr: false });
const AnyGraph: any = Graph;

type Persona = "full" | "prod" | "ba";
type SideTab = "filters" | "definition";
type StatusFilter = "__all__" | "pass" | "fail" | "unknown";
type ReferenceFilter = "__all__" | "reference" | "non_reference";
type DirectionFilter = "all" | "forward" | "backward";
type DepthFilter = "all" | "1" | "2" | "3" | "4" | "5";

const RENDERABLE_NODE_TYPES = new Set(["model", "source", "seed", "snapshot", "macro"]);
const DEFAULT_SHAPE_PROPERTIES = {
  borderRadius: 10,
  borderDashes: false,
  interpolation: false,
  useImageSize: false,
  useBorderWithImage: false,
  coordinateOrigin: "center" as const,
};

function resolveGraphNodeId(node: any, fallbackPrefix: string, index: number): string {
  const explicit = typeof node?.unique_id === "string" ? node.unique_id.trim() : "";
  if (explicit) return explicit;
  return `synthetic:${fallbackPrefix}:${index}`;
}

function isTableLikeNode(node: any): boolean {
  const resourceType = String(node?.resource_type || "").toLowerCase();
  return RENDERABLE_NODE_TYPES.has(resourceType);
}

function summarizeTests(rawTests: any): string {
  if (!Array.isArray(rawTests) || rawTests.length === 0) return "None";
  const names = rawTests
    .map((test: any) => {
      if (typeof test === "string") return test;
      if (typeof test?.name === "string") return test.name;
      if (typeof test?.testName === "string") return test.testName;
      if (typeof test?.unique_id === "string") return test.unique_id;
      return "";
    })
    .filter(Boolean);
  if (names.length === 0) return "None";
  if (names.length <= 6) return names.join(", ");
  return `${names.slice(0, 6).join(", ")} (+${names.length - 6} more)`;
}

function getNodeVisualStyle(node: any): {
  color: any;
  borderWidth?: number;
  font?: { color: string };
  size?: number;
} {
  const styleKey = node.metadata?.observability?.styleKey || "none";
  const styleMap: Record<
    string,
    { bg: string; border: string; font: string; borderWidth: number }
  > = {
    none: { bg: "#0b5cad", border: "#08437f", font: "#ffffff", borderWidth: 1 },
    schema: { bg: "#CC79A7", border: "#8B4F72", font: "#ffffff", borderWidth: 3 },
    volume: { bg: "#0072B2", border: "#004E7A", font: "#ffffff", borderWidth: 3 },
    freshness: { bg: "#E69F00", border: "#9A6B00", font: "#111111", borderWidth: 3 },
    "schema+volume": { bg: "#56B4E9", border: "#2C6D8C", font: "#111111", borderWidth: 4 },
    "schema+freshness": { bg: "#F0E442", border: "#9F9730", font: "#111111", borderWidth: 4 },
    "volume+freshness": { bg: "#009E73", border: "#00664B", font: "#ffffff", borderWidth: 4 },
    "schema+volume+freshness": {
      bg: "#000000",
      border: "#2E2E2E",
      font: "#ffffff",
      borderWidth: 5,
    },
  };

  const type = String(node.resource_type || "");
  const typeColorMap: Record<string, string> = {
    model: "#0b5cad",
    source: "#6c757d",
    seed: "#845ec2",
    snapshot: "#17a2b8",
  };
  const base = styleMap[styleKey] || styleMap.none;
  const fallbackColor = node.metadata?.isReferenceData
    ? "#5b8def"
    : typeColorMap[type] || "#6c757d";
  const useStatusStyle = styleKey !== "none";
  const bg = useStatusStyle ? base.bg : fallbackColor;
  const border = useStatusStyle ? base.border : "#2f3e4f";
  const fontColor = useStatusStyle ? base.font : "#ffffff";
  const isRoot = node?.isRoot === true;

  return {
    color: {
      background: bg,
      border,
      highlight: { background: bg, border },
      hover: { background: bg, border },
    },
    borderWidth: isRoot ? 6 : useStatusStyle ? base.borderWidth : 1,
    font: { color: fontColor },
    size: isRoot ? 32 : 22,
  };
}

function getNodeShape(node: any, isRoot: boolean = false): string {
  if (node?.isReferenceData || node?.metadata?.isReferenceData) return "hexagon";
  const resourceType = String(node?.resource_type || "").toLowerCase();
  if (resourceType === "macro" || resourceType === "operation") return "ellipse";
  return "box";
}

function formatNodeLabel(raw: string): string {
  const value = String(raw || "");
  if (value.length <= 34) return value;
  return `${value.slice(0, 31)}...`;
}

function getNodeMetadata(node: any, persona: Persona) {
  const broadChecks = node.metadata?.observability;
  const tests = Array.isArray(node.metadata?.tests) ? node.metadata.tests : [];
  const testsSummary = summarizeTests(tests);
  const dependsOn = Array.isArray(node.metadata?.dependsOn) ? node.metadata.dependsOn : [];
  const dependedOnBy = Array.isArray(node.metadata?.dependedOnBy) ? node.metadata.dependedOnBy : [];

  if (persona === "prod") {
    return {
      title: "Operational Metadata",
      fields: [
        {
          label: "Resource Type",
          value: getResourceTypeLabel(node.resource_type, { includeRaw: true }),
        },
        { label: "Materialization", value: node.metadata?.config?.materialized || "N/A" },
        { label: "Row Count", value: node.metadata?.rowCount ?? "N/A" },
        { label: "Last Updated", value: node.metadata?.lastUpdated || "N/A" },
        { label: "Schema Check", value: broadChecks?.schema?.status || "unknown" },
        { label: "Volume Check", value: broadChecks?.volume?.status || "unknown" },
        { label: "Freshness Check", value: broadChecks?.freshness?.status || "unknown" },
        { label: "Test Count", value: tests.length },
        { label: "Tests", value: testsSummary },
      ],
    };
  }

  if (persona === "ba") {
    return {
      title: "Business Metadata",
      fields: [
        { label: "Display Name", value: node.label },
        { label: "Description", value: node.title || "Not documented" },
        { label: "Owner", value: node.metadata?.config?.owner || "N/A" },
        { label: "Tags", value: node.metadata?.tags?.join(", ") || "None" },
        { label: "Reference Data", value: node.metadata?.isReferenceData ? "Yes" : "No" },
      ],
    };
  }

  return {
    title: "Data Definition",
    fields: [
      { label: "Unique ID", value: node.id },
      { label: "Display Name", value: node.label },
      {
        label: "Resource Type",
        value: getResourceTypeLabel(node.resource_type, { includeRaw: true }),
      },
      { label: "Package", value: node.package_name || "N/A" },
      { label: "Description", value: node.title || "Not documented" },
      { label: "Tags", value: node.metadata?.tags?.join(", ") || "None" },
      { label: "Reference Data", value: node.metadata?.isReferenceData ? "Yes" : "No" },
      { label: "Reference Reason", value: node.metadata?.referenceReason || "N/A" },
      { label: "Row Count", value: node.metadata?.rowCount ?? "N/A" },
      { label: "Last Updated", value: node.metadata?.lastUpdated || "N/A" },
      { label: "Schema Check", value: broadChecks?.schema?.status || "unknown" },
      { label: "Volume Check", value: broadChecks?.volume?.status || "unknown" },
      { label: "Freshness Check", value: broadChecks?.freshness?.status || "unknown" },
      { label: "Style Key", value: broadChecks?.styleKey || "none" },
      { label: "Depends On", value: dependsOn.length ? dependsOn.join(", ") : "None" },
      { label: "Referenced By", value: dependedOnBy.length ? dependedOnBy.join(", ") : "None" },
      { label: "Test Count", value: tests.length },
      { label: "Tests", value: testsSummary },
    ],
  };
}

interface BuiltGraph {
  nodes: any[];
  edges: any[];
  depth: any;
  parentMap: Record<string, number>;
  childMap: Record<string, number>;
}

export default function DagViewer({
  uniqueId,
  defaultRender,
}: {
  uniqueId: string;
  defaultRender?: boolean;
}) {
  const renderGraph = defaultRender ?? true;
  const [graphData, setGraphData] = useState<BuiltGraph | null>(null);
  const [persona, setPersona] = useState<Persona>("full");
  const [sideTab, setSideTab] = useState<SideTab>("filters");
  const [tagFilter, setTagFilter] = useState<string>("__all__");
  const [schemaFilter, setSchemaFilter] = useState<StatusFilter>("__all__");
  const [volumeFilter, setVolumeFilter] = useState<StatusFilter>("__all__");
  const [freshnessFilter, setFreshnessFilter] = useState<StatusFilter>("__all__");
  const [referenceFilter, setReferenceFilter] = useState<ReferenceFilter>("__all__");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [depthFilter, setDepthFilter] = useState<DepthFilter>("all");
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [network, setNetwork] = useState<any | null>(null);
  const graphViewportRef = useRef<HTMLDivElement | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const currentSnapshot = searchParams.get("currentSnapshot") || undefined;
  const previousSnapshot = searchParams.get("previousSnapshot") || undefined;
  const previousManifestPath = searchParams.get("previousManifestPath") || undefined;
  const previousCatalogPath = searchParams.get("previousCatalogPath") || undefined;

  const { data: dagData, isLoading, error, computeTimeMs, isCached } = useDAG(uniqueId, {
    maxDepth: 100,
    fresh: false,
    currentSnapshot,
    previousSnapshot,
    previousManifestPath,
    previousCatalogPath,
  });

  useEffect(() => {
    if (!dagData) return;

    const rawNodesById = new Map<string, any>();
    const nodeMap = new Map<string, any>();
    const edgeMap = new Map<string, any>();
    let syntheticCounter = 0;

    const upsertNode = (rawNode: any, isRoot: boolean = false): string | null => {
      if (!rawNode) return null;
      if (!isRoot && !isTableLikeNode(rawNode)) return null;

      const id = resolveGraphNodeId(rawNode, isRoot ? "root" : "node", ++syntheticCounter);
      rawNodesById.set(id, rawNode);

      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          label: formatNodeLabel(rawNode.name || id),
          title: rawNode.description || rawNode.name || id,
          resource_type: rawNode.resource_type,
          shape: getNodeShape(rawNode, isRoot),
          isRoot,
          metadata: rawNode,
          package_name: rawNode.database,
        });
      }
      return id;
    };

    const rootId = upsertNode(dagData.root, true);
    if (!rootId) {
      setGraphData({
        nodes: [],
        edges: [],
        depth: dagData.depth,
        parentMap: {},
        childMap: {},
      });
      setSelectedNode(null);
      return;
    }

    (dagData.parents || []).forEach((node: any) => {
      upsertNode(node, false);
    });
    (dagData.children || []).forEach((node: any) => {
      upsertNode(node, false);
    });

    const addEdge = (fromId: string, toId: string) => {
      if (!fromId || !toId || fromId === toId) return;
      if (!nodeMap.has(fromId) || !nodeMap.has(toId)) return;
      const edgeId = `${fromId}=>${toId}`;
      if (!edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, { id: edgeId, from: fromId, to: toId, arrows: "to" });
      }
    };

    rawNodesById.forEach((rawNode, id) => {
      const dependsOn = Array.isArray(rawNode?.dependsOn) ? rawNode.dependsOn : [];
      for (const depId of dependsOn) {
        if (nodeMap.has(depId)) {
          addEdge(depId, id);
        }
      }
    });

    const nodes = Array.from(nodeMap.values());
    const built: BuiltGraph = {
      nodes,
      edges: Array.from(edgeMap.values()),
      depth: dagData.depth,
      parentMap: dagData.parentMap || {},
      childMap: dagData.childMap || {},
    };
    setGraphData(built);
    setSelectedNode(nodes.find((n) => n.id === rootId) || null);
  }, [dagData]);

  const availableTags = useMemo(() => {
    if (!graphData) return [];
    return Array.from(
      new Set(
        graphData.nodes.flatMap((n: any) => (Array.isArray(n.metadata?.tags) ? n.metadata.tags : []))
      )
    )
      .map((t) => String(t))
      .sort((a, b) => a.localeCompare(b));
  }, [graphData]);

  const filteredGraph = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [], depth: null };

    const statusPass = (value: StatusFilter, actual: string | undefined) =>
      value === "__all__" || actual === value;

    const maxDepth = depthFilter === "all" ? Number.POSITIVE_INFINITY : Number(depthFilter);

    const directionDepthPass = (node: any): boolean => {
      if (node.isRoot || node.id === uniqueId) return true;

      const pDepth = graphData.parentMap[node.id];
      const cDepth = graphData.childMap[node.id];
      const hasParentPath = Number.isFinite(pDepth);
      const hasChildPath = Number.isFinite(cDepth);

      if (directionFilter === "backward") {
        return hasParentPath && pDepth <= maxDepth;
      }
      if (directionFilter === "forward") {
        return hasChildPath && cDepth <= maxDepth;
      }

      const parentOk = hasParentPath && pDepth <= maxDepth;
      const childOk = hasChildPath && cDepth <= maxDepth;
      return parentOk || childOk;
    };

    const allowed = new Set<string>();
    graphData.nodes.forEach((node: any) => {
      if (!directionDepthPass(node)) return;

      if (node.isRoot || node.id === uniqueId) {
        allowed.add(node.id);
        return;
      }

      const tags = Array.isArray(node.metadata?.tags) ? node.metadata.tags : [];
      const checks = node.metadata?.observability;
      const tagOk = tagFilter === "__all__" || tags.includes(tagFilter);
      const schemaOk = statusPass(schemaFilter, checks?.schema?.status);
      const volumeOk = statusPass(volumeFilter, checks?.volume?.status);
      const freshnessOk = statusPass(freshnessFilter, checks?.freshness?.status);
      const referenceOk =
        referenceFilter === "__all__" ||
        (referenceFilter === "reference" && node.metadata?.isReferenceData) ||
        (referenceFilter === "non_reference" && !node.metadata?.isReferenceData);

      if (tagOk && schemaOk && volumeOk && freshnessOk && referenceOk) {
        allowed.add(node.id);
      }
    });

    return {
      ...graphData,
      nodes: graphData.nodes.filter((n: any) => allowed.has(n.id)),
      edges: graphData.edges.filter((e: any) => allowed.has(e.from) && allowed.has(e.to)),
    };
  }, [
    graphData,
    uniqueId,
    tagFilter,
    schemaFilter,
    volumeFilter,
    freshnessFilter,
    referenceFilter,
    directionFilter,
    depthFilter,
  ]);

  const styledNodes = useMemo(() => {
    if (!filteredGraph) return [];
    const mapped = filteredGraph.nodes.map((node: any) => {
      const visual = getNodeVisualStyle(node);
      const shapeProperties = {
        ...DEFAULT_SHAPE_PROPERTIES,
        borderRadius: node.shape === "box" ? 10 : 0,
      };
      return {
        ...node,
        color: visual.color,
        borderWidth: Math.max(2, visual.borderWidth || 1),
        shapeProperties,
        margin:
          node.shape === "box"
            ? { top: 8, right: 14, bottom: 8, left: 14 }
            : { top: 4, right: 8, bottom: 4, left: 8 },
        font: {
          ...(visual.font || {}),
          size: node?.isRoot ? 15 : 12,
          face: "Inter, Segoe UI, Helvetica, Arial, sans-serif",
          strokeWidth: 0,
        },
        size: visual.size || 22,
      };
    });
    return Array.from(new Map(mapped.map((node: any) => [String(node.id), node])).values());
  }, [filteredGraph]);

  const fitGraphView = useCallback(
    (net: any) => {
      const fitIds = Array.from(new Set(filteredGraph.nodes.map((n: any) => n.id)));
      if (fitIds.length === 0) return;
      net.fit({
        nodes: fitIds,
        animation: { duration: 300, easingFunction: "easeInOutQuad" },
      });
      const scale = Number(net.getScale?.() || 1);
      const nodeCount = fitIds.length;
      const minScale =
        nodeCount <= 20 ? 0.8 : nodeCount <= 60 ? 0.72 : nodeCount <= 180 ? 0.6 : 0.45;
      const position = net.getViewPosition ? net.getViewPosition() : undefined;
      net.moveTo({
        position,
        scale: Math.max(minScale, scale),
        animation: { duration: 200, easingFunction: "easeInOutQuad" },
      });
      if (fitIds.includes(uniqueId)) {
        net.selectNodes([uniqueId]);
      }
    },
    [filteredGraph.nodes, uniqueId]
  );

  const centerNodeInView = useCallback(
    (nodeId: string) => {
      if (!network || !nodeId) return;
      const positions = network.getPositions?.([nodeId]);
      const nodePosition = positions?.[nodeId];
      if (!nodePosition) return;
      const currentScale = Number(network.getScale?.() || 1);
      network.moveTo({
        position: nodePosition,
        scale: currentScale,
        animation: { duration: 220, easingFunction: "easeInOutQuad" },
      });
    },
    [network]
  );

  const layoutTuning = useMemo(() => {
    let maxLabelLength = 0;
    for (const node of filteredGraph.nodes as any[]) {
      const labelLength = String(node?.label || "").length;
      if (labelLength > maxLabelLength) {
        maxLabelLength = labelLength;
      }
    }

    // Increase spacing for longer labels to reduce visual bunching/overlap.
    const levelSeparation = Math.max(300, Math.min(760, 200 + maxLabelLength * 8));
    const nodeSpacing = Math.max(240, Math.min(680, 170 + maxLabelLength * 6));
    const treeSpacing = Math.max(280, Math.min(760, 220 + maxLabelLength * 7));

    return { levelSeparation, nodeSpacing, treeSpacing };
  }, [filteredGraph.nodes]);

  const graphSurface = useMemo(() => {
    const nodeCount = filteredGraph.nodes.length;
    return {
      width: Math.max(1800, Math.min(5200, 1200 + nodeCount * 95)),
      height: Math.max(1100, Math.min(3600, 760 + nodeCount * 55)),
    };
  }, [filteredGraph.nodes.length]);

  const zoomGraph = useCallback(
    (factor: number) => {
      if (!network) return;
      const currentScale = Number(network.getScale?.() || 1);
      const nextScale = Math.max(0.2, Math.min(3, currentScale * factor));
      const position = network.getViewPosition ? network.getViewPosition() : undefined;
      network.moveTo({
        position,
        scale: nextScale,
        animation: { duration: 140, easingFunction: "easeInOutQuad" },
      });
    },
    [network]
  );

  const openNodeAsRoot = useCallback(
    (nodeId: string) => {
      if (!nodeId || nodeId === uniqueId) return;
      const params = searchParams.toString();
      const nextUrl = params
        ? `/dag/${encodeURIComponent(nodeId)}?${params}`
        : `/dag/${encodeURIComponent(nodeId)}`;
      router.push(nextUrl);
    },
    [router, searchParams, uniqueId]
  );

  const graphKey = useMemo(
    () =>
      [
        uniqueId,
        tagFilter,
        referenceFilter,
        schemaFilter,
        volumeFilter,
        freshnessFilter,
        directionFilter,
        depthFilter,
        filteredGraph.nodes.length,
        filteredGraph.edges.length,
      ].join("|"),
    [
      uniqueId,
      tagFilter,
      referenceFilter,
      schemaFilter,
      volumeFilter,
      freshnessFilter,
      directionFilter,
      depthFilter,
      filteredGraph.nodes.length,
      filteredGraph.edges.length,
    ]
  );

  useEffect(() => {
    if (!renderGraph || !network || filteredGraph.nodes.length === 0) return;
    try {
      fitGraphView(network);
    } catch {
      // no-op
    }
  }, [network, renderGraph, filteredGraph, fitGraphView]);

  useEffect(() => {
    const viewport = graphViewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
  }, [graphKey]);

  const options = useMemo(
    () => ({
      layout: {
        hierarchical: {
          enabled: true,
          direction: "LR",
          sortMethod: "directed",
          levelSeparation: layoutTuning.levelSeparation,
          nodeSpacing: layoutTuning.nodeSpacing,
          treeSpacing: layoutTuning.treeSpacing,
          blockShifting: true,
          edgeMinimization: true,
          parentCentralization: true,
        },
      },
      nodes: {
        shape: "box",
        shapeProperties: { ...DEFAULT_SHAPE_PROPERTIES },
        scaling: {
          min: 14,
          max: 36,
          label: { min: 9, max: 24, drawThreshold: 7, maxVisible: 40 },
        },
        font: { size: 12, face: "Inter, Segoe UI, Helvetica, Arial, sans-serif" },
      },
      edges: {
        width: 1,
        color: { inherit: "from" },
        smooth: { enabled: true, type: "cubicBezier", roundness: 0.32 },
      },
      physics: { enabled: false },
      interaction: {
        navigationButtons: false,
        zoomView: true,
        dragView: false,
        dragNodes: false,
        keyboard: {
          enabled: true,
          bindToWindow: false,
          speed: { x: 10, y: 10, zoom: 0.03 },
        },
        tooltipDelay: 200,
        hideEdgesOnDrag: false,
        hideEdgesOnZoom: false,
      },
      autoResize: true,
      height: "100%",
    }),
    [layoutTuning]
  );

  const events = useMemo(
    () => ({
      select: (event: any) => {
        const nodeId = event.nodes?.[0];
        if (!nodeId || !filteredGraph) return;
        const node = filteredGraph.nodes.find((n: any) => n.id === nodeId);
        centerNodeInView(nodeId);
        setSelectedNode(node || null);
        setSideTab("definition");
      },
      doubleClick: (event: any) => {
        const nodeId = event.nodes?.[0];
        if (!nodeId) return;
        openNodeAsRoot(String(nodeId));
      },
      deselect: () => setSelectedNode(null),
    }),
    [centerNodeInView, filteredGraph, openNodeAsRoot]
  );

  if (isLoading) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div>Computing DAG lineage...</div>
          <div className="help-block" style={{ marginTop: "8px", fontSize: "12px" }}>
            This may take 100-500ms on first load, then cached for 30-60 minutes.
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <div className="panel-body" style={{ color: "#d9534f" }}>
          <div>
            <strong>Error loading DAG</strong>
          </div>
          <div className="help-block">{error.message}</div>
        </div>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="panel">
        <div className="panel-body">No DAG data found for this object.</div>
      </div>
    );
  }

  const selectedMetadata = selectedNode ? getNodeMetadata(selectedNode, persona) : null;

  return (
    <div style={{ display: "flex", gap: "12px", height: "100%", minHeight: 0 }}>
      <div style={{ width: "330px", minWidth: "300px", maxWidth: "360px", flex: "none" }}>
        <div className="panel" style={{ height: "100%" }}>
          <div className="panel-body" style={{ height: "100%", overflowY: "auto" }}>
            <div className="switches" style={{ marginTop: 0 }}>
              <div className="switch">
                <span
                  className={`${sideTab === "filters" ? "active" : ""} switch-label btn btn-sm`}
                  onClick={() => setSideTab("filters")}
                >
                  Filters
                </span>
              </div>
              <div className="switch">
                <span
                  className={`${sideTab === "definition" ? "active" : ""} switch-label btn btn-sm`}
                  onClick={() => setSideTab("definition")}
                >
                  Data Definition
                </span>
              </div>
            </div>

            {sideTab === "filters" ? (
              <div style={{ marginTop: "10px" }}>
                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>Lineage Direction</div>
                  <select
                    value={directionFilter}
                    onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
                    className="form-control"
                  >
                    <option value="all">All</option>
                    <option value="forward">Forward (downstream)</option>
                    <option value="backward">Backward (upstream)</option>
                  </select>
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>Lineage Depth</div>
                  <select
                    value={depthFilter}
                    onChange={(e) => setDepthFilter(e.target.value as DepthFilter)}
                    className="form-control"
                  >
                    <option value="all">All</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>Tag</div>
                  <select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="form-control"
                  >
                    <option value="__all__">All tags</option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>
                        tag:{tag}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>Reference Data</div>
                  <select
                    value={referenceFilter}
                    onChange={(e) => setReferenceFilter(e.target.value as ReferenceFilter)}
                    className="form-control"
                  >
                    <option value="__all__">All</option>
                    <option value="reference">Reference only</option>
                    <option value="non_reference">Non-reference only</option>
                  </select>
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>Schema Check</div>
                  <select
                    value={schemaFilter}
                    onChange={(e) => setSchemaFilter(e.target.value as StatusFilter)}
                    className="form-control"
                  >
                    <option value="__all__">All</option>
                    <option value="fail">Fail</option>
                    <option value="pass">Pass</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>Volume Check</div>
                  <select
                    value={volumeFilter}
                    onChange={(e) => setVolumeFilter(e.target.value as StatusFilter)}
                    className="form-control"
                  >
                    <option value="__all__">All</option>
                    <option value="fail">Fail</option>
                    <option value="pass">Pass</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>Freshness Check</div>
                  <select
                    value={freshnessFilter}
                    onChange={(e) => setFreshnessFilter(e.target.value as StatusFilter)}
                    className="form-control"
                  >
                    <option value="__all__">All</option>
                    <option value="fail">Fail</option>
                    <option value="pass">Pass</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>

                <button
                  className="btn btn-default"
                  style={{ width: "100%" }}
                  onClick={() => {
                    setTagFilter("__all__");
                    setReferenceFilter("__all__");
                    setSchemaFilter("__all__");
                    setVolumeFilter("__all__");
                    setFreshnessFilter("__all__");
                    setDirectionFilter("all");
                    setDepthFilter("all");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div style={{ marginTop: "10px" }}>
                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>Persona View</div>
                  <select
                    value={persona}
                    onChange={(e) => setPersona(e.target.value as Persona)}
                    className="form-control"
                  >
                    <option value="full">Full (all metadata)</option>
                    <option value="prod">Prod (operational)</option>
                    <option value="ba">BA (business)</option>
                  </select>
                </div>

                {selectedMetadata ? (
                  <div>
                    <h6 style={{ marginBottom: "8px" }}>
                      {selectedMetadata.title}
                      <small style={{ display: "block", marginTop: "3px" }}>
                        ({selectedNode?.resource_type || "unknown"})
                      </small>
                    </h6>
                    <dl style={{ fontSize: "12px", marginBottom: 0 }}>
                      {selectedMetadata.fields.map((field: any, idx: number) => (
                        <React.Fragment key={idx}>
                          <dt style={{ marginTop: "8px", fontWeight: "bold" }}>{field.label}</dt>
                          <dd style={{ marginLeft: "10px", marginBottom: "6px", wordBreak: "break-word" }}>
                            {typeof field.value === "object"
                              ? JSON.stringify(field.value)
                              : String(field.value)}
                          </dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <div className="help-block">Click any node in the DAG to view Data Definition.</div>
                )}
                <div className="help-block" style={{ marginTop: "8px", marginBottom: 0 }}>
                  Double-click a node to redraw lineage with that node as root.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "2px 0 4px 2px" }}>
          <h1 style={{ margin: 0 }}>
            <span className="break">DAG: {uniqueId}</span>
            <small>Lineage</small>
          </h1>
        </div>

        <div className="panel">
          <div className="panel-body" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button className="btn btn-default" disabled={!network} onClick={() => zoomGraph(0.85)}>
              Zoom -
            </button>
            <button className="btn btn-default" disabled={!network} onClick={() => zoomGraph(1.2)}>
              Zoom +
            </button>
            <button
              className="btn btn-default"
              disabled={!network}
              onClick={() => {
                if (!network) return;
                fitGraphView(network);
              }}
            >
              Autofit
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          {renderGraph ? (
            <div
              ref={graphViewportRef}
              style={{
                width: "100%",
                height: "100%",
                overflowX: "auto",
                overflowY: "auto",
                border: "1px solid rgba(0, 30, 60, 0.075)",
                borderRadius: "4px",
              }}
            >
              <div
                style={{
                  width: `${graphSurface.width}px`,
                  height: `${graphSurface.height}px`,
                  minWidth: "100%",
                  minHeight: "100%",
                }}
              >
                <AnyGraph
                  key={graphKey}
                  graph={{
                    nodes: styledNodes,
                    edges: filteredGraph.edges,
                  }}
                  options={options}
                  events={events}
                  getNetwork={(net: any) => setNetwork(net)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="help-block" style={{ marginTop: "6px" }}>
          {computeTimeMs !== undefined ? `Computed in ${computeTimeMs}ms ${isCached ? "(cached)" : "(fresh)"}` : ""}
          {graphData.depth
            ? ` | Depth: up ${graphData.depth.upstream} down ${graphData.depth.downstream}`
            : ""}
          {graphData.depth && (graphData.depth.upstream > 50 || graphData.depth.downstream > 50)
            ? " | Warning: graph truncated for performance."
            : ""}
          {" | Drag-pan disabled. Use Zoom +/- , Autofit, and scrollbars."}
        </div>
      </div>
    </div>
  );
}
