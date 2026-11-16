import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const occt = await require("occt-import-js")({
  print: () => {},
  printErr: () => {},
});
const source = readFileSync(
  new URL("../public/samples/support-assembly.step", import.meta.url),
);
const options = {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.001,
  angularDeflection: 0.3,
};

function dimensions(meshes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    mesh.attributes.position.array.forEach((value, index) => {
      const axis = index % 3;
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    });
  }
  return max.map((value, axis) => value - min[axis]);
}

test("real STEP B-rep imports six solids with expected millimetre dimensions and colors", () => {
  const result = occt.ReadStepFile(source, options);
  assert.equal(result.success, true);
  assert.equal(result.meshes.length, 6);
  assert.deepEqual(dimensions(result.meshes), [130, 84, 82]);
  assert.equal(
    result.meshes.reduce((sum, mesh) => sum + mesh.index.array.length / 3, 0),
    184,
  );
  assert.ok(result.root.children.length > 0);
  assert.ok(result.meshes.every((mesh) => mesh.color?.length === 3));
  for (const mesh of result.meshes) {
    const vertexCount = mesh.attributes.position.array.length / 3;
    assert.ok(
      mesh.index.array.every(
        (index) => Number.isInteger(index) && index >= 0 && index < vertexCount,
      ),
    );
    assert.ok(mesh.attributes.position.array.every(Number.isFinite));
  }
});

test("input STEP units are converted to millimetres", () => {
  const meters = Buffer.from(
    source.toString().replace("SI_UNIT(.MILLI.,.METRE.)", "SI_UNIT($,.METRE.)"),
  );
  const result = occt.ReadStepFile(meters, options);
  assert.equal(result.success, true);
  assert.deepEqual(dimensions(result.meshes), [130000, 84000, 82000]);
});

test("truncated STEP cannot yield a usable model", () => {
  const result = occt.ReadStepFile(
    Buffer.from("ISO-10303-21;\nHEADER;\n"),
    options,
  );
  assert.ok(!result.success || !result.meshes?.length);
});
