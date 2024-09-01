"use client";
import React from "react";
import _ from "underscore";
import { GenerateDAGClient } from "./GenerateDAGClient";

export const GenerateDAG = ({ model }: { model: any }) => {
  return (
    < GenerateDAGClient model={model}  />
  );
};