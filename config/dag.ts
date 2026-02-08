export interface DAGClientConfig {
  maxNodes: number;
  maxEdges: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDAGClientConfig(): DAGClientConfig {
  return {
    maxNodes: parsePositiveInt(process.env.NEXT_PUBLIC_MAX_NODES, 400),
    maxEdges: parsePositiveInt(process.env.NEXT_PUBLIC_MAX_EDGES, 800),
  };
}
