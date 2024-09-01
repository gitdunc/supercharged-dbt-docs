"use client";
import React from "react";
import Graph from "react-graph-vis";
import _ from "underscore";

export const GenerateDAGClient = ({ model }: { model: any }) => {
  const graph = {
    nodes: [
      { id: 1, label: 'Node 1', title: 'Node 1 Tooltip' },
      { id: 2, label: 'Node 2', title: 'Node 2 Tooltip' },
      { id: 3, label: 'Node 3', title: 'Node 3 Tooltip' },
      { id: 4, label: 'Node 4', title: 'Node 4 Tooltip' },
      { id: 5, label: 'Node 5', title: 'Node 5 Tooltip' },
    ],
    edges: [
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 4 },
      { from: 2, to: 5 },
    ],
  };

  const options = {
    layout: {
      hierarchical: false,
    },
    edges: {
      color: '#000000',
    },
    nodes: {
      color: '#ff6f61',
      shape: 'dot',
      size: 16,
    },
    physics: {
      enabled: true,
    },
  };

  const events = {
    select: function (event: { nodes: any; edges: any; }) {
      var { nodes, edges } = event;
      console.log('Selected nodes:', nodes);
      console.log('Selected edges:', edges);
    },
  };

  return (
    <div>
      <Graph
        graph={graph}
        options={options}
        events={events}
        style={{ height: '500px' }}
      />
    </div>
  );
};