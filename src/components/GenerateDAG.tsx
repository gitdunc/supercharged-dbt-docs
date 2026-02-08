"use client";
import React from "react";
import dynamic from "next/dynamic";

const GenerateDAGClient = dynamic(
  () => import("./GenerateDAGClient").then((mod) => mod.GenerateDAGClient),
  {
    ssr: false,
    loading: () => (
      <div className="panel">
        <div className="panel-body">Loading DAG component...</div>
      </div>
    ),
  }
);

export const GenerateDAG = ({ model }: { model: any }) => {
  return <GenerateDAGClient model={model} />;
};
