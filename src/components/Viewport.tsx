import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { StepViewer } from "../viewer/StepViewer";
import type { DisplayMode, LoadedModel, ModelStats } from "../types";

interface Props {
  viewerRef: RefObject<StepViewer | null>;
  model: LoadedModel | null;
  onStats: (stats: ModelStats) => void;
  onSelect: (id: number | null) => void;
  onError: (message: string) => void;
  selected: number | null;
  mode: DisplayMode;
  grid: boolean;
  axes: boolean;
  orthographic: boolean;
  opacity: number;
  explode: number;
}

export default function Viewport(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const {
    viewerRef,
    model,
    onStats,
    onSelect,
    onError,
    selected,
    mode,
    grid,
    axes,
    orthographic,
    opacity,
    explode,
  } = props;
  useEffect(() => {
    if (!host.current) return;
    let viewer: StepViewer;
    try {
      viewer = new StepViewer(host.current, onSelect, () =>
        onError("图形上下文已丢失，请刷新页面后重新打开模型。"),
      );
      viewerRef.current = viewer;
    } catch {
      onError(
        "无法创建三维视口。请使用支持 WebGL 2 的浏览器，并开启硬件加速。",
      );
      return;
    }
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [viewerRef, onSelect, onError]);

  useEffect(() => {
    if (!model || !viewerRef.current) return;
    try {
      onStats(viewerRef.current.load(model));
    } catch (error) {
      onError(error instanceof Error ? error.message : "模型显示失败。");
    }
  }, [model, viewerRef, onStats, onError]);

  // Reapply settings after a model replacement as well as on control changes.
  useEffect(() => viewerRef.current?.setMode(mode), [mode, model, viewerRef]);
  useEffect(() => viewerRef.current?.setGrid(grid), [grid, model, viewerRef]);
  useEffect(() => viewerRef.current?.setAxes(axes), [axes, model, viewerRef]);
  useEffect(
    () => viewerRef.current?.setOrthographic(orthographic),
    [orthographic, model, viewerRef],
  );
  useEffect(
    () => viewerRef.current?.setOpacity(opacity),
    [opacity, model, viewerRef],
  );
  useEffect(
    () => viewerRef.current?.setExplode(explode),
    [explode, model, viewerRef],
  );
  useEffect(
    () => viewerRef.current?.select(selected),
    [selected, model, viewerRef],
  );
  return <div className="canvas-host" ref={host} />;
}
