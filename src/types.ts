export type Quality = "draft" | "balanced" | "fine";
export type DisplayMode = "shaded" | "edges" | "wireframe";
export type View =
  "iso" | "front" | "back" | "top" | "bottom" | "right" | "left";

export interface ModelNode {
  name: string;
  meshes: number[];
  children: ModelNode[];
}

export interface PartData {
  name: string;
  positions: Float32Array;
  normals?: Float32Array;
  indices: Uint32Array;
  color?: number[];
  faces: { first: number; last: number; color: number[] | null }[];
}

export interface ModelData {
  parts: PartData[];
  root: ModelNode;
  elapsed: number;
}

export interface LoadedModel extends ModelData {
  fileName: string;
  bytes: number;
  quality: Quality;
}

export interface PartInfo {
  id: number;
  name: string;
  triangles: number;
  visible: boolean;
}

export interface ModelStats {
  dimensions: [number, number, number];
  triangles: number;
  parts: PartInfo[];
}

export type WorkerMessage =
  | { type: "phase"; message: string }
  | { type: "result"; model: ModelData }
  | { type: "error"; message: string };
