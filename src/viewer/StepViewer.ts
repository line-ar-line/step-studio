import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { DisplayMode, ModelData, ModelStats, View } from "../types";

type RenderPart = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>;
  edges?: THREE.LineSegments;
  offset: THREE.Vector3;
};

const DIRECTIONS: Record<View, [number, number, number]> = {
  iso: [1, -1.4, 1],
  front: [0, -1, 0],
  back: [0, 1, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
};

/** Rendering stays outside React. Only selection and model metadata enter UI state. */
export class StepViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private model = new THREE.Group();
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private controls: OrbitControls;
  private grid?: THREE.GridHelper;
  private axes = new THREE.AxesHelper(1);
  private resizeObserver: ResizeObserver;
  private parts: RenderPart[] = [];
  private frame = 0;
  private disposed = false;
  private pointerStart = new THREE.Vector2();
  private mode: DisplayMode = "edges";
  private opacity = 1;
  private selected: number | null = null;
  private diagonal = 100;
  private orthoHalfHeight = 100;
  private viewDirection = new THREE.Vector3(...DIRECTIONS.iso).normalize();

  constructor(
    private host: HTMLDivElement,
    private onSelect: (id: number | null) => void,
    private onContextError: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#edf1ee");
    this.renderer.domElement.setAttribute(
      "aria-label",
      "STEP 三维模型视口，拖动旋转，滚轮缩放，右键平移",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(180, -250, 190);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener("change", this.invalidate);
    this.scene.add(this.model);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x86978e, 2.7));
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(1, -2, 4);
    const fill = new THREE.DirectionalLight(0xe0f5ee, 1.4);
    fill.position.set(-3, 2, 1);
    this.scene.add(key, fill, this.axes);
    this.updateHelpers(100);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.resize();
  }

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.onContextError();
  };

  private pointerDown = (event: PointerEvent) =>
    this.pointerStart.set(event.clientX, event.clientY);

  private pointerUp = (event: PointerEvent) => {
    if (
      event.button !== 0 ||
      this.pointerStart.distanceTo(
        new THREE.Vector2(event.clientX, event.clientY),
      ) > 5
    )
      return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const point = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(point, this.camera);
    const hits = ray.intersectObjects(
      this.parts.filter((part) => part.mesh.visible).map((part) => part.mesh),
    );
    this.onSelect(hits[0] ? Number(hits[0].object.userData.partId) : null);
  };

  private resize = () => {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.renderer.setSize(width, height);
    const aspect = width / height;
    if (this.camera instanceof THREE.PerspectiveCamera)
      this.camera.aspect = aspect;
    else {
      this.camera.left = -this.orthoHalfHeight * aspect;
      this.camera.right = this.orthoHalfHeight * aspect;
      this.camera.top = this.orthoHalfHeight;
      this.camera.bottom = -this.orthoHalfHeight;
    }
    this.camera.updateProjectionMatrix();
    this.invalidate();
  };

  private invalidate = () => {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  };

  private updateHelpers(size: number) {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      const materials = Array.isArray(this.grid.material)
        ? this.grid.material
        : [this.grid.material];
      materials.forEach((material) => material.dispose());
    }
    const visible = this.grid?.visible ?? true;
    this.grid = new THREE.GridHelper(size * 3, 30, 0xb4c5bb, 0xd4dfd7);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.position.z = -size * 0.001;
    this.grid.visible = visible;
    this.scene.add(this.grid);
    this.axes.scale.setScalar(size * 0.35);
  }

  load(data: ModelData): ModelStats {
    this.clearModel();
    let triangles = 0;
    data.parts.forEach((part, id) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(part.positions, 3),
      );
      geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
      if (part.normals)
        geometry.setAttribute(
          "normal",
          new THREE.BufferAttribute(part.normals, 3),
        );
      else geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const colors = new Map<string, number>();
      const materials: THREE.MeshStandardMaterial[] = [];
      const materialIndex = (rgb?: number[] | null) => {
        const key = rgb?.join(",") ?? "default";
        const cached = colors.get(key);
        if (cached !== undefined) return cached;
        // OCCT exports linear RGB values; converting them from sRGB again darkens CAD colors.
        const color = rgb
          ? new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2])
          : new THREE.Color("#71a996");
        const index = materials.length;
        materials.push(
          new THREE.MeshStandardMaterial({
            color,
            metalness: 0.16,
            roughness: 0.48,
            side: THREE.DoubleSide,
          }),
        );
        colors.set(key, index);
        return index;
      };
      const fallback = materialIndex(part.color);
      let cursor = 0;
      for (const face of part.faces) {
        const start = face.first * 3;
        const end = Math.min((face.last + 1) * 3, part.indices.length);
        if (start > cursor) geometry.addGroup(cursor, start - cursor, fallback);
        if (end > start)
          geometry.addGroup(
            start,
            end - start,
            materialIndex(face.color ?? part.color),
          );
        cursor = end;
      }
      if (cursor < part.indices.length)
        geometry.addGroup(cursor, part.indices.length - cursor, fallback);
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.userData.partId = id;
      mesh.name = part.name;
      this.model.add(mesh);
      this.parts.push({ mesh, offset: new THREE.Vector3() });
      triangles += part.indices.length / 3;
    });
    const box = new THREE.Box3().setFromObject(this.model);
    if (
      box.isEmpty() ||
      !Number.isFinite(
        box.min.x + box.min.y + box.min.z + box.max.x + box.max.y + box.max.z,
      )
    ) {
      this.clearModel();
      throw new Error("模型的几何范围无效，无法预览。");
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.model.position.set(-center.x, -center.y, -box.min.z);
    this.diagonal = Math.max(size.length(), 0.0001);
    this.parts.forEach((part) => {
      const localCenter = part.mesh.geometry.boundingBox!.getCenter(
        new THREE.Vector3(),
      );
      part.offset.copy(localCenter).sub(center);
      if (part.offset.lengthSq() > 1e-16)
        part.offset.normalize().multiplyScalar(this.diagonal * 0.4);
    });
    this.updateHelpers(Math.max(size.x, size.y, size.z, 0.0001));
    this.setMode(this.mode);
    this.setOpacity(this.opacity);
    this.select(null);
    this.setView("iso");
    return {
      dimensions: [size.x, size.y, size.z],
      triangles,
      parts: data.parts.map((part, id) => ({
        id,
        name: part.name,
        triangles: part.indices.length / 3,
        visible: true,
      })),
    };
  }

  private visibleBounds() {
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.parts.forEach(({ mesh }) => {
      if (mesh.visible)
        box.union(
          mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld),
        );
    });
    return box;
  }

  fit() {
    const box = this.visibleBounds();
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, this.diagonal * 0.001);
    const aspect = Math.max(
      this.host.clientWidth / Math.max(this.host.clientHeight, 1),
      0.01,
    );
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    if (!direction.lengthSq()) direction.copy(this.viewDirection);
    let distance = radius * 3;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
      const limitingFov = Math.min(
        halfFov,
        Math.atan(Math.tan(halfFov) * aspect),
      );
      distance = (radius / Math.sin(limitingFov)) * 1.15;
    } else {
      this.orthoHalfHeight = (radius * 1.18) / Math.min(aspect, 1);
      this.camera.zoom = 1;
    }
    this.camera.near = this.diagonal / 10_000;
    this.camera.far = this.diagonal * 10_000;
    this.controls.minDistance = this.diagonal * 0.001;
    this.controls.maxDistance = this.diagonal * 1000;
    // Flush residual damping before applying an exact standard view.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.target.copy(sphere.center);
    this.camera.position
      .copy(sphere.center)
      .addScaledVector(direction, distance);
    this.controls.update();
    this.controls.enableDamping = true;
    this.resize();
  }

  setView(view: View) {
    this.controls.enableDamping = false;
    this.controls.update();
    this.viewDirection.set(...DIRECTIONS[view]).normalize();
    this.camera.up.set(0, 0, 1);
    if (view === "top") this.camera.up.set(0, 1, 0);
    if (view === "bottom") this.camera.up.set(0, -1, 0);
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(this.viewDirection, this.diagonal * 3);
    this.controls.update();
    this.controls.enableDamping = true;
    this.fit();
  }

  setOrthographic(enabled: boolean) {
    if (enabled === this.camera instanceof THREE.OrthographicCamera) return;
    const old = this.camera;
    this.camera = enabled
      ? new THREE.OrthographicCamera(-1, 1, 1, -1, old.near, old.far)
      : new THREE.PerspectiveCamera(38, 1, old.near, old.far);
    this.camera.position.copy(old.position);
    this.camera.up.copy(old.up);
    this.controls.object = this.camera;
    this.fit();
  }

  setMode(mode: DisplayMode) {
    this.mode = mode;
    this.parts.forEach((part) => {
      part.mesh.material.forEach((material) => {
        material.wireframe = mode === "wireframe";
      });
      if (mode === "edges" && !part.edges) {
        part.edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(part.mesh.geometry, 25),
          new THREE.LineBasicMaterial({
            color: 0x345f52,
            transparent: true,
            opacity: 0.45,
          }),
        );
        // Edges share the mesh transform and visibility, but must not take part in raycasting.
        part.edges.raycast = () => {};
        part.mesh.add(part.edges);
      }
      if (part.edges) part.edges.visible = mode === "edges";
    });
    this.invalidate();
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
    this.parts.forEach(({ mesh }) =>
      mesh.material.forEach((material) => {
        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.depthWrite = opacity === 1;
        material.needsUpdate = true;
      }),
    );
    this.invalidate();
  }

  setExplode(amount: number) {
    this.parts.forEach((part) =>
      part.mesh.position.copy(part.offset).multiplyScalar(amount),
    );
    this.invalidate();
  }

  setGrid(visible: boolean) {
    if (this.grid) this.grid.visible = visible;
    this.invalidate();
  }
  setAxes(visible: boolean) {
    this.axes.visible = visible;
    this.invalidate();
  }
  setVisible(id: number, visible: boolean) {
    if (this.parts[id]) this.parts[id].mesh.visible = visible;
    this.invalidate();
  }

  select(id: number | null) {
    this.selected = id;
    this.parts.forEach(({ mesh }, index) =>
      mesh.material.forEach((material) => {
        material.emissive.set(index === this.selected ? 0x204f3c : 0x000000);
        material.emissiveIntensity = 0.45;
      }),
    );
    this.invalidate();
  }

  async screenshot(fileName: string) {
    this.renderer.render(this.scene, this.camera);
    const blob = await new Promise<Blob | null>((resolve) =>
      this.renderer.domElement.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("截图生成失败，请重试。");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.replace(/\.(stp|step)$/i, "") + ".png";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private clearModel() {
    this.parts.forEach(({ mesh, edges }) => {
      mesh.geometry.dispose();
      mesh.material.forEach((material) => material.dispose());
      if (edges) {
        edges.geometry.dispose();
        (edges.material as THREE.Material).dispose();
      }
    });
    this.parts = [];
    this.model.clear();
    this.model.position.set(0, 0, 0);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.invalidate);
    this.controls.dispose();
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.pointerDown,
    );
    this.renderer.domElement.removeEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.clearModel();
    if (this.grid) {
      this.grid.geometry.dispose();
      const materials = Array.isArray(this.grid.material)
        ? this.grid.material
        : [this.grid.material];
      materials.forEach((material) => material.dispose());
    }
    this.axes.geometry.dispose();
    const axesMaterials = Array.isArray(this.axes.material)
      ? this.axes.material
      : [this.axes.material];
    axesMaterials.forEach((material) => material.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
