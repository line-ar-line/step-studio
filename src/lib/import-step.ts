import type { ModelData, Quality, WorkerMessage } from "../types";

export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function validateFile(file: File): string | null {
  if (!/\.(step|stp)$/i.test(file.name))
    return "请选择 .step 或 .stp 格式的文件。";
  if (file.size === 0) return "这个文件是空的，请重新选择。";
  if (file.size > MAX_FILE_BYTES)
    return "当前浏览器预览上限为 100 MB，请使用更小的模型。";
  return null;
}

// One disposable worker per import also releases the WASM heap on cancel/finish.
export function importStep(
  bytes: ArrayBuffer,
  quality: Quality,
  onPhase: (message: string) => void,
  signal: AbortSignal,
): Promise<ModelData> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("已取消", "AbortError"));
    const worker = new Worker(
      new URL(
        `${import.meta.env.BASE_URL}step-worker.js`,
        window.location.href,
      ),
    );
    const timeout = window.setTimeout(
      () => finish(new Error("解析超过 120 秒，请降低精度或使用更小的模型。")),
      120_000,
    );
    function finish(error?: Error, model?: ModelData) {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else if (model) resolve(model);
    }
    function abort() {
      finish(new DOMException("已取消", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () =>
      finish(
        new Error(
          "解析器启动失败。请确认 JS / WASM 文件可访问，并通过本地服务器打开页面。",
        ),
      );
    worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (data.type === "phase") onPhase(data.message);
      if (data.type === "error") finish(new Error(data.message));
      if (data.type === "result") finish(undefined, data.model);
    };
    worker.postMessage({ bytes, quality }, [bytes]);
  });
}
