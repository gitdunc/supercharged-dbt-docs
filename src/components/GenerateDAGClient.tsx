"use client";
import React from "react";
import Graph from "react-graph-vis";
import _ from "underscore";
//import styles from './Graph.module.css';
import {edges, nodes} from './GraphDAGData'

export const GenerateDAGClient = ({ model }: { model: any }) => {

  var options = {
      layout: {
        hierarchical: false
      },
      nodes:{
          shape: "dot",
          scaling: {
              min: 10,
              max: 30,
              label: {
                  min: 8,
                  max: 30,
                  drawThreshold: 12,
                  maxVisible: 20
              }
          },
          font: {
              size: 12,
              face: "Tahoma"
          }
      },
      edges: {
          width: 0.15,
          color: {inherit: "from"},
          smooth: {
              type: "continuous"
          }
      },
      physics: false,
      interaction: {
          navigationButtons: true,
          tooltipDelay: 200,
          hideEdgesOnDrag: true,
          hideEdgesOnZoom: true
      },
      height: "900px"
  }
  
  // Define your filter condition
  var data = {nodes: nodes.filter(({source_name}) => source_name ===model.source_name), edges: edges.filter(({source_name}) => source_name ===model.source_name)}
return (
  <div className='container'>
      <Graph
          graph = {data}
          options={options}
      />
  </div>
)
}