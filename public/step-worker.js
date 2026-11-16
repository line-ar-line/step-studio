/* global occtimportjs */
// Classic worker: keep Emscripten's JS and WASM together, independent of Vite bundling.
self.onmessage = async ({ data }) => {
  const started = performance.now();
  try {
    const header = new TextDecoder().decode(
      new Uint8Array(data.bytes, 0, Math.min(data.bytes.byteLength, 4096)),
    );
    if (!header.includes("ISO-10303-21"))
      throw new Error("文件不是有效的 STEP Part 21 文本文件。");
    self.postMessage({ type: "phase", message: "正在加载 STEP 解析器…" });
    importScripts(new URL("vendor/occt-import-js.js", self.location.href).href);
    const occt = await occtimportjs({
      locateFile: (file) => new URL(`vendor/${file}`, self.location.href).href,
      print: () => {},
      printErr: () => {},
    });
    self.postMessage({ type: "phase", message: "正在读取几何并生成预览网格…" });
    const deflection = {
      draft: [0.005, 0.5],
      balanced: [0.001, 0.3],
      fine: [0.0003, 0.15],
    }[data.quality] || [0.001, 0.3];
    const result = occt.ReadStepFile(new Uint8Array(data.bytes), {
      linearUnit: "millimeter",
      linearDeflectionType: "bounding_box_ratio",
      linearDeflection: deflection[0],
      angularDeflection: deflection[1],
    });
    if (!result.success || !result.meshes?.length) {
      throw new Error(
        "未读取到可显示的实体。请检查 STEP 文件是否完整，以及是否包含三维曲面或实体。",
      );
    }
    const transfers = [];
    const parts = result.meshes.map((mesh, index) => {
      const positions = new Float32Array(mesh.attributes.position.array);
      const indices = new Uint32Array(mesh.index.array);
      const normals = mesh.attributes.normal
        ? new Float32Array(mesh.attributes.normal.array)
        : undefined;
      if (
        !positions.length ||
        !indices.length ||
        positions.length % 3 ||
        indices.length % 3
      ) {
        throw new Error(`第 ${index + 1} 个网格数据不完整。`);
      }
      transfers.push(positions.buffer, indices.buffer);
      if (normals) transfers.push(normals.buffer);
      return {
        name: mesh.name || `零件 ${index + 1}`,
        positions,
        normals,
        indices,
        color: mesh.color,
        faces: mesh.brep_faces || [],
      };
    });
    self.postMessage(
      {
        type: "result",
        model: {
          parts,
          root: result.root,
          elapsed: performance.now() - started,
        },
      },
      transfers,
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "STEP 解析失败，请检查文件或降低预览精度。",
    });
  }
};
