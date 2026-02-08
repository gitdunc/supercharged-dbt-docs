// These variables will be injected into a page that will use them.
/* eslint no-unused-vars: "off" */
// Const won't work here, only var.
/* eslint no-var: "off" */

export var nodes = [
   
      {source_name: 'customers', id: 1, label: 'Node 1', title: 'Tooltip for Node 1', shape: 'box'},
      {source_name: 'customers', id: 2, label: 'Node 2', title: 'Tooltip for Node 2', shape: 'circle'},
      {source_name: 'customers', id: 3, label: 'Node 3', title: 'Tooltip for Node 3', shape: 'star'},
      {source_name: 'customers', id: 4, label: 'Node 4', title: 'Tooltip for Node 4' },
      {source_name: 'customers', id: 5, label: 'Node 5', title: 'Tooltip for Node 5' },
	  {source_name: 'customers', id: 6, label: 'Node 6', title: 'Tooltip for Node 6', shape: 'dot' },
    ]
// create an array with edges
export var edges = [	
      {source_name: 'customers', from: 1, to: 2, smooth:{type: "curvedCW"}, arrows: {from: {enabled: true}}},
      {source_name: 'customers', from: 1, to: 3 },
      {source_name: 'customers', from: 2, to: 4 },
      {source_name: 'customers', from: 2, to: 5 },
	{source_name: 'customers', from: 5, to: 6 },
	];

const EMPTY_GRAPH = { nodes: [], edges: [] };

const sourceGraphIndex = nodes.reduce((acc, node) => {
  const sourceName = node.source_name || "__unknown__";
  if (!acc[sourceName]) {
    acc[sourceName] = { nodes: [], edges: [] };
  }
  acc[sourceName].nodes.push(node);
  return acc;
}, {});

edges.forEach((edge) => {
  const sourceName = edge.source_name || "__unknown__";
  if (!sourceGraphIndex[sourceName]) {
    sourceGraphIndex[sourceName] = { nodes: [], edges: [] };
  }
  sourceGraphIndex[sourceName].edges.push(edge);
});

export function getPrototypeGraphBySource(sourceName) {
  if (!sourceName) {
    return EMPTY_GRAPH;
  }

  return sourceGraphIndex[sourceName] || EMPTY_GRAPH;
}
