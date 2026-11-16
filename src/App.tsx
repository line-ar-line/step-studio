import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cuboid,
  Expand,
  Eye,
  EyeOff,
  FileBox,
  FolderOpen,
  Grid2X2,
  Layers3,
  LoaderCircle,
  Maximize2,
  MousePointer2,
  Move3D,
  PanelLeftClose,
  PanelRightClose,
  RotateCcw,
  Scan,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { importStep, validateFile } from "./lib/import-step";
import ViewCube from "./components/ViewCube";
import type { StepViewer } from "./viewer/StepViewer";
import type {
  DisplayMode,
  LoadedModel,
  ModelStats,
  Quality,
  View,
} from "./types";

const Viewport = lazy(() => import("./components/Viewport"));
const QUALITY_NAMES: Record<Quality, string> = {
  draft: "快速",
  balanced: "均衡",
  fine: "精细",
};
const VIEWS: { id: View; label: string; key?: string }[] = [
  { id: "iso", label: "等轴测", key: "1" },
  { id: "front", label: "前视", key: "2" },
  { id: "top", label: "俯视", key: "3" },
  { id: "right", label: "右视", key: "4" },
  { id: "back", label: "后视" },
  { id: "bottom", label: "仰视" },
  { id: "left", label: "左视" },
];
const formatCount = (value: number) =>
  new Intl.NumberFormat("zh-CN").format(value);
const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const formatDimension = (value: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 }).format(value);

export default function App() {
  const input = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<StepViewer | null>(null);
  const activeImport = useRef<AbortController | null>(null);
  const lastFile = useRef<File | null>(null);
  const dragDepth = useRef(0);
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [phase, setPhase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [quality, setQuality] = useState<Quality>("balanced");
  const [mode, setMode] = useState<DisplayMode>("edges");
  const [grid, setGrid] = useState(true);
  const [axes, setAxes] = useState(true);
  const [orthographic, setOrthographic] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [explode, setExplode] = useState(0);
  const [filter, setFilter] = useState("");
  const [help, setHelp] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<"model" | "settings" | null>(
    null,
  );

  const onError = useCallback((message: string) => setError(message), []);
  const onStats = useCallback((next: ModelStats) => setStats(next), []);

  const loadSource = useCallback(
    async (source: File | null, chosenQuality: Quality) => {
      if (source) {
        const message = validateFile(source);
        if (message) {
          setError(message);
          return;
        }
      }
      activeImport.current?.abort();
      const controller = new AbortController();
      activeImport.current = controller;
      setError("");
      setBusy(true);
      setPhase(source ? "正在读取文件…" : "正在打开示例模型…");
      try {
        let file = source;
        if (!file) {
          const response = await fetch(
            `${import.meta.env.BASE_URL}samples/support-assembly.step`,
            { signal: controller.signal },
          );
          if (!response.ok)
            throw new Error("示例文件加载失败，请选择本地 STEP 文件。");
          file = new File([await response.blob()], "support-assembly.step");
        }
        const bytes = await file.arrayBuffer();
        const parsed = await importStep(
          bytes,
          chosenQuality,
          (message) => {
            if (!controller.signal.aborted) setPhase(message);
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        lastFile.current = file;
        setSelected(null);
        setExplode(0);
        setFilter("");
        setModel({
          ...parsed,
          fileName: file.name,
          bytes: file.size,
          quality: chosenQuality,
        });
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(caught instanceof Error ? caught.message : "文件读取失败。");
      } finally {
        if (activeImport.current === controller) {
          setBusy(false);
          setPhase("");
          activeImport.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!lastFile.current) void loadSource(null, "balanced");
    return () => activeImport.current?.abort();
  }, [loadSource]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) ||
        target.isContentEditable ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        input.current?.click();
      }
      if (event.key.toLowerCase() === "f") viewerRef.current?.fit();
      if (event.key === "Escape") {
        setSelected(null);
        setHelp(false);
      }
      const view = VIEWS.find((item) => item.key === event.key);
      if (view) viewerRef.current?.setView(view.id);
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, []);

  function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void loadSource(file, quality);
  }

  function dropFile(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = event.dataTransfer.files;
    if (files.length > 1) {
      setError("请每次打开一个 STEP 文件；装配体可以包含多个零件。");
      return;
    }
    if (files[0]) void loadSource(files[0], quality);
  }

  function togglePart(id: number) {
    const part = stats?.parts[id];
    if (!part) return;
    viewerRef.current?.setVisible(id, !part.visible);
    setStats((previous) => {
      if (!previous) return previous;
      const parts = previous.parts.map((part) =>
        part.id === id ? { ...part, visible: !part.visible } : part,
      );
      return { ...previous, parts };
    });
  }

  function showAll() {
    stats?.parts.forEach((part) =>
      viewerRef.current?.setVisible(part.id, true),
    );
    setStats((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        parts: previous.parts.map((part) => ({ ...part, visible: true })),
      };
    });
  }

  async function screenshot() {
    if (!model) return;
    try {
      await viewerRef.current?.screenshot(model.fileName);
      setNotice("已导出当前视角的 PNG 截图");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "截图失败。");
    }
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError("当前环境不支持全屏，请在独立浏览器中打开。");
    }
  }

  const selectedPart = selected === null ? null : stats?.parts[selected];
  const visibleCount = stats?.parts.filter((part) => part.visible).length ?? 0;
  const filteredParts =
    stats?.parts.filter((part) =>
      part.name.toLowerCase().includes(filter.toLowerCase()),
    ) ?? [];

  return (
    <div
      className="app"
      onDragEnter={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) {
          dragDepth.current += 1;
          setDragging(true);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={dropFile}
    >
      <input
        ref={input}
        type="file"
        accept=".step,.stp"
        onChange={openFile}
        className="sr-only"
        aria-label="选择 STEP 文件"
      />
      <header className="app-header">
        <a className="brand" href="./" aria-label="STEP Studio 首页">
          <span className="brand-mark">
            <Box size={24} strokeWidth={1.6} />
          </span>
          <span>
            STEP<span className="brand-light"> Studio</span>
          </span>
          <span className="version">PREVIEW / 01</span>
        </a>
        <div className="header-actions">
          <span className="local-badge">
            <span /> 本地解析
          </span>
          <button
            className="text-button help-button"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={16} /> 使用指南
          </button>
          <button
            className="primary-button"
            onClick={() => input.current?.click()}
          >
            <FolderOpen size={16} /> 打开 STEP <kbd>O</kbd>
          </button>
        </div>
      </header>

      <div className="workspace-heading">
        <div className="workspace-path">
          <span>工作空间</span>
          <ChevronRight size={14} />
          <strong title={model?.fileName}>
            {model?.fileName ?? "未打开模型"}
          </strong>
          {model ? <span className="file-chip">STEP</span> : null}
        </div>
        <span className="workspace-note">
          <ShieldCheck size={14} /> 文件在浏览器内处理
        </span>
      </div>

      <div className="mobile-panel-bar">
        <button
          onClick={() => {
            setLeftOpen(true);
            setMobilePanel(mobilePanel === "model" ? null : "model");
          }}
        >
          <Layers3 size={14} /> 模型结构
        </button>
        <button
          onClick={() => {
            setRightOpen(true);
            setMobilePanel(mobilePanel === "settings" ? null : "settings");
          }}
        >
          <SlidersHorizontal size={14} /> 显示设置
        </button>
        {mobilePanel ? (
          <button
            onClick={() => setMobilePanel(null)}
            aria-label="关闭移动面板"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
      <main
        className={`workspace ${leftOpen ? "" : "left-closed"} ${rightOpen ? "" : "right-closed"} ${mobilePanel ? `mobile-${mobilePanel}` : ""}`}
      >
        <aside className="model-panel" aria-label="模型结构">
          <div className="panel-heading">
            <span>
              <Layers3 size={16} /> 模型结构
            </span>
            <button
              className="icon-button"
              title="收起模型面板"
              aria-label="收起模型面板"
              onClick={() => {
                setLeftOpen(false);
                setMobilePanel(null);
              }}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <div className="model-tree-area">
            <label className="search-field">
              <Search size={14} />
              <input
                placeholder="查找零件…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="查找零件"
              />
            </label>
            <div className="tree-root">
              <ChevronDown size={14} />
              <Boxes size={16} />
              <span title={model?.fileName}>
                {model?.fileName.replace(/\.(step|stp)$/i, "") ?? "模型"}
              </span>
              <span className="count-badge">{stats?.parts.length ?? 0}</span>
            </div>
            <div className="parts-list">
              {filteredParts.map((part) => (
                <div
                  key={part.id}
                  className={`part-row ${selected === part.id ? "selected" : ""} ${part.visible ? "" : "is-hidden"}`}
                >
                  <button
                    className="part-name"
                    onClick={() => setSelected(part.id)}
                    title={part.name}
                  >
                    <Box size={15} />
                    <span>{part.name}</span>
                  </button>
                  <button
                    className="visibility-button"
                    title={part.visible ? "隐藏零件" : "显示零件"}
                    aria-label={`${part.visible ? "隐藏" : "显示"} ${part.name}`}
                    aria-pressed={part.visible}
                    onClick={() => togglePart(part.id)}
                  >
                    {part.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
              ))}
              {stats && !filteredParts.length ? (
                <p className="muted empty-search">没有匹配的零件</p>
              ) : null}
            </div>
            {stats ? (
              <button className="show-all" onClick={showAll}>
                <Eye size={13} /> 显示全部{" "}
                <span>
                  {visibleCount}/{stats.parts.length}
                </span>
              </button>
            ) : null}
          </div>
          <div className="sample-card">
            <div className="sample-icon">
              <Cuboid size={25} strokeWidth={1.25} />
            </div>
            <p>从一个模型开始</p>
            <span>打开你的 STEP，或探索示例组件。</span>
            <button
              onClick={() => void loadSource(null, quality)}
              disabled={busy}
            >
              打开示例模型 <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="privacy-note">
            <ShieldCheck size={15} />
            <span>
              你的设计，留在你的设备上。
              <br />
              选择文件后无需上传服务器。
            </span>
          </div>
        </aside>

        <section className="viewport-panel" aria-label="三维预览">
          <div className="viewport-toolbar">
            <div className="toolbar-group">
              {!leftOpen ? (
                <button
                  className="icon-button"
                  title="展开模型结构"
                  aria-label="展开模型结构"
                  onClick={() => setLeftOpen(true)}
                >
                  <Layers3 size={16} />
                </button>
              ) : null}
              <span className="viewport-title">
                <span className="status-dot" /> 三维预览
              </span>
              <span className="toolbar-divider" />
              <div className="segmented-control" aria-label="显示模式">
                {(
                  [
                    { id: "shaded", label: "实体", icon: Box },
                    { id: "edges", label: "边线", icon: Cuboid },
                    { id: "wireframe", label: "线框", icon: Scan },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    title={item.label}
                    aria-pressed={mode === item.id}
                    className={mode === item.id ? "active" : ""}
                    onClick={() => setMode(item.id)}
                  >
                    <item.icon size={15} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="toolbar-group">
              <button
                className="icon-button"
                title="适应窗口 (F)"
                aria-label="适应窗口"
                onClick={() => viewerRef.current?.fit()}
                disabled={!model}
              >
                <Expand size={17} />
              </button>
              <button
                className="icon-button"
                title="导出 PNG 截图"
                aria-label="导出 PNG 截图"
                onClick={() => void screenshot()}
                disabled={!model}
              >
                <ArrowDownToLine size={17} />
              </button>
              <button
                className="icon-button fullscreen-button"
                title="全屏预览"
                aria-label="全屏预览"
                onClick={() => void fullscreen()}
              >
                <Maximize2 size={16} />
              </button>
              {!rightOpen ? (
                <button
                  className="icon-button"
                  title="展开显示设置"
                  aria-label="展开显示设置"
                  onClick={() => setRightOpen(true)}
                >
                  <SlidersHorizontal size={16} />
                </button>
              ) : null}
            </div>
          </div>
          <div className="viewport-stage">
            <Suspense
              fallback={
                <div className="loading-view">
                  <LoaderCircle className="spin" size={22} />
                  <span>正在准备三维视口…</span>
                </div>
              }
            >
              <Viewport
                viewerRef={viewerRef}
                model={model}
                onStats={onStats}
                onSelect={setSelected}
                onError={onError}
                selected={selected}
                mode={mode}
                grid={grid}
                axes={axes}
                orthographic={orthographic}
                opacity={opacity}
                explode={explode}
              />
            </Suspense>
            <div className="viewport-label">
              <span>MODEL VIEW</span>
              <p>
                {orthographic ? "正交投影" : "透视投影"}
                <span> / </span>毫米
              </p>
            </div>
            <ViewCube
              disabled={!model}
              onViewChange={(view) => viewerRef.current?.setView(view)}
            />
            {!model && !busy ? (
              <div className="empty-view">
                <FileBox size={42} strokeWidth={1} />
                <h1>让设计，立体呈现。</h1>
                <p>拖入 STEP 文件，开始探索每一个视角。</p>
                <button
                  className="primary-button"
                  onClick={() => input.current?.click()}
                >
                  <Upload size={16} /> 选择 STEP 文件
                </button>
                <small>.step / .stp · 最大 100 MB</small>
              </div>
            ) : null}
            {busy ? (
              <div className="import-overlay" role="status">
                <div className="import-card">
                  <LoaderCircle size={25} className="spin" />
                  <strong>{phase}</strong>
                  <span>STEP 几何在本机解析，请稍候</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      activeImport.current?.abort();
                      setBusy(false);
                      setPhase("");
                    }}
                  >
                    取消解析
                  </button>
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                <button
                  aria-label="关闭错误提示"
                  className="icon-button"
                  onClick={() => setError("")}
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
            {notice ? (
              <div className="notice" role="status">
                <Check size={15} />
                {notice}
              </div>
            ) : null}
            <div className="viewport-bottom">
              <div className="axis-legend">
                <span className="axis-x">X</span>
                <span className="axis-y">Y</span>
                <span className="axis-z">Z</span>
                <span className="unit-label">Z 轴向上</span>
              </div>
              <div className="mouse-guide">
                <MousePointer2 size={13} />
                <span>拖动旋转</span>
                <i /> <span>右键平移</span>
                <i />
                <span>滚轮缩放</span>
              </div>
            </div>
          </div>
          <div className="view-presets">
            <span className="presets-label">视角</span>
            {VIEWS.map((view) => (
              <button
                key={view.id}
                onClick={() => viewerRef.current?.setView(view.id)}
                title={`${view.label}${view.key ? ` (${view.key})` : ""}`}
                disabled={!model}
              >
                {view.id === "iso" ? <Box size={14} /> : null}
                {view.label}
                {view.key ? <kbd>{view.key}</kbd> : null}
              </button>
            ))}
            <button
              className="fit-button"
              onClick={() => viewerRef.current?.fit()}
              disabled={!model}
            >
              <Expand size={13} /> 适应 <kbd>F</kbd>
            </button>
          </div>
        </section>

        <aside className="properties-panel" aria-label="显示设置和模型信息">
          <div className="panel-heading">
            <span>
              <SlidersHorizontal size={16} /> 显示设置
            </span>
            <button
              className="icon-button"
              title="收起显示设置"
              aria-label="收起显示设置"
              onClick={() => {
                setRightOpen(false);
                setMobilePanel(null);
              }}
            >
              <PanelRightClose size={16} />
            </button>
          </div>
          <div className="properties-content">
            <section className="settings-section">
              <h2>视口</h2>
              <label className="toggle-row">
                <span>
                  <Grid2X2 size={14} /> 参考网格
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={grid}
                  onChange={(event) => setGrid(event.target.checked)}
                />
                <span className="switch" />
              </label>
              <label className="toggle-row">
                <span>
                  <Move3D size={14} /> 坐标轴
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={axes}
                  onChange={(event) => setAxes(event.target.checked)}
                />
                <span className="switch" />
              </label>
              <label className="toggle-row">
                <span>
                  <Box size={14} /> 正交投影
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={orthographic}
                  onChange={(event) => setOrthographic(event.target.checked)}
                />
                <span className="switch" />
              </label>
              <div className="range-label">
                <label htmlFor="opacity">不透明度</label>
                <span>{Math.round(opacity * 100)}%</span>
              </div>
              <input
                id="opacity"
                className="range"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
              <div className="range-label">
                <label htmlFor="explode">零件分散</label>
                <span>{Math.round(explode * 100)}%</span>
              </div>
              <input
                id="explode"
                className="range"
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={explode}
                disabled={!stats || stats.parts.length < 2}
                onChange={(event) => setExplode(Number(event.target.value))}
              />
              <p className="setting-hint">按零件中心向外分散，便于查看遮挡。</p>
            </section>
            <section className="settings-section">
              <h2>预览精度</h2>
              <div className="quality-control">
                {(["draft", "balanced", "fine"] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={quality === value}
                    className={quality === value ? "active" : ""}
                    onClick={() => setQuality(value)}
                  >
                    {QUALITY_NAMES[value]}
                  </button>
                ))}
              </div>
              <p className="setting-hint">
                精度越高，曲面越平滑，解析耗时越长。
              </p>
              {model && model.quality !== quality ? (
                <button
                  className="reparse-button"
                  disabled={busy}
                  onClick={() => void loadSource(lastFile.current, quality)}
                >
                  <RotateCcw size={13} /> 按{QUALITY_NAMES[quality]}精度重新解析
                </button>
              ) : null}
            </section>
            <section className="settings-section model-info">
              <div className="section-title">
                <h2>{selectedPart ? "所选零件" : "模型信息"}</h2>
                <span>{selectedPart ? "PART" : "INFO"}</span>
              </div>
              {selectedPart ? (
                <>
                  <p className="selected-name" title={selectedPart.name}>
                    <Box size={14} /> {selectedPart.name}
                  </p>
                  <dl>
                    <div>
                      <dt>三角面</dt>
                      <dd>{formatCount(selectedPart.triangles)}</dd>
                    </div>
                    <div>
                      <dt>可见性</dt>
                      <dd>{selectedPart.visible ? "显示" : "隐藏"}</dd>
                    </div>
                  </dl>
                  <button
                    className="text-button clear-selection"
                    onClick={() => setSelected(null)}
                  >
                    返回模型信息 <ChevronRight size={13} />
                  </button>
                </>
              ) : (
                <dl>
                  <div>
                    <dt>文件大小</dt>
                    <dd>{model ? formatSize(model.bytes) : "—"}</dd>
                  </div>
                  <div>
                    <dt>网格零件</dt>
                    <dd>{stats ? formatCount(stats.parts.length) : "—"}</dd>
                  </div>
                  <div>
                    <dt>三角面</dt>
                    <dd>{stats ? formatCount(stats.triangles) : "—"}</dd>
                  </div>
                  <div>
                    <dt>解析耗时</dt>
                    <dd>
                      {model ? `${(model.elapsed / 1000).toFixed(2)} s` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>当前精度</dt>
                    <dd>{model ? QUALITY_NAMES[model.quality] : "—"}</dd>
                  </div>
                </dl>
              )}
            </section>
            <section className="settings-section bounds-section">
              <div className="section-title">
                <h2>整体包围盒</h2>
                <span>mm</span>
              </div>
              {(["X", "Y", "Z"] as const).map((axis, index) => (
                <div className="dimension-row" key={axis}>
                  <span className={`axis-${axis.toLowerCase()}`}>{axis}</span>
                  <span>
                    {stats ? formatDimension(stats.dimensions[index]) : "—"}
                  </span>
                </div>
              ))}
              <p className="setting-hint">
                所有几何统一换算为毫米；包围盒尺寸供预览参考。
              </p>
            </section>
          </div>
        </aside>
      </main>
      <footer className="status-bar">
        <div>
          <span className={`status-dot ${busy ? "is-busy" : ""}`} />
          <span>
            {busy ? "正在解析" : model ? "模型已就绪" : "等待打开文件"}
          </span>
          {stats ? (
            <>
              <i />
              <span>{visibleCount} 个可见零件</span>
              <i />
              <span>{formatCount(stats.triangles)} 个三角面</span>
            </>
          ) : null}
        </div>
        <span>
          STEP Studio<span className="status-separator"> / </span>浏览每一个细节
        </span>
      </footer>

      {dragging ? (
        <div className="drop-overlay">
          <div>
            <Upload size={40} strokeWidth={1.4} />
            <h2>松开，打开你的模型</h2>
            <p>支持 .step / .stp 文件</p>
          </div>
        </div>
      ) : null}
      {help ? (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              autoFocus
              className="icon-button close-help"
              aria-label="关闭使用指南"
              onClick={() => setHelp(false)}
            >
              <X size={19} />
            </button>
            <span className="eyebrow">A CLOSER LOOK</span>
            <h2 id="help-title">从任意角度，理解设计。</h2>
            <p>打开本地 STEP 文件，或直接拖进工作空间。</p>
            <dl>
              <div>
                <dt>旋转模型</dt>
                <dd>鼠标左键拖动 / 单指拖动</dd>
              </div>
              <div>
                <dt>平移模型</dt>
                <dd>鼠标右键拖动 / 双指移动</dd>
              </div>
              <div>
                <dt>缩放视图</dt>
                <dd>滚轮 / 双指缩放</dd>
              </div>
              <div>
                <dt>适应窗口</dt>
                <dd>
                  <kbd>F</kbd>
                </dd>
              </div>
              <div>
                <dt>等轴测 / 前 / 上 / 右</dt>
                <dd>
                  <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>
                </dd>
              </div>
              <div>
                <dt>打开文件 / 取消选择</dt>
                <dd>
                  <kbd>O</kbd> / <kbd>Esc</kbd>
                </dd>
              </div>
            </dl>
            <div className="help-note">
              <ShieldCheck size={18} />
              <span>
                文件在浏览器内解析。首次访问需要加载应用和解析器；服务在本机运行时，断网也能打开新的
                STEP 文件。
              </span>
            </div>
            <button className="primary-button" onClick={() => setHelp(false)}>
              开始探索 <ArrowUpRight size={15} />
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
