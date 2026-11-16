import { RotateCcw } from "lucide-react";
import type { View } from "../types";

// One set of shared vertices defines both the drawing and each face's hit area.
// Equal projected edge lengths give a true isometric cube with 30-degree diagonals.
const FACES = [
  {
    view: "top",
    label: "上",
    title: "俯视 (3)",
    points: [
      [44, 4],
      [78.64, 24],
      [44, 44],
      [9.36, 24],
    ],
    text: [44, 24],
  },
  {
    view: "front",
    label: "前",
    title: "前视 (2)",
    points: [
      [9.36, 24],
      [44, 44],
      [44, 84],
      [9.36, 64],
    ],
    text: [26.68, 54],
  },
  {
    view: "right",
    label: "右",
    title: "右视 (4)",
    points: [
      [44, 44],
      [78.64, 24],
      [78.64, 64],
      [44, 84],
    ],
    text: [61.32, 54],
  },
] as const;

const PROJECTED_FACES = FACES.map((face) => {
  const xs = face.points.map(([x]) => x);
  const ys = face.points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  return {
    ...face,
    bounds: { left, top, width, height },
    viewBox: `${left} ${top} ${width} ${height}`,
    polygon: face.points.map((point) => point.join(",")).join(" "),
    clipPath: `polygon(${face.points.map(([x, y]) => `${((x - left) / width) * 100}% ${((y - top) / height) * 100}%`).join(",")})`,
  };
});

interface Props {
  disabled: boolean;
  onViewChange: (view: View) => void;
}

export default function ViewCube({ disabled, onViewChange }: Props) {
  return (
    <div className="view-cube" role="group" aria-label="快捷视角">
      {PROJECTED_FACES.map((face) => (
        <button
          key={face.view}
          type="button"
          className={`cube-face cube-${face.view}`}
          style={{
            ...face.bounds,
            clipPath: face.clipPath,
          }}
          title={face.title}
          aria-label={`${face.label}视图`}
          disabled={disabled}
          onClick={() => onViewChange(face.view)}
        >
          <svg viewBox={face.viewBox} aria-hidden="true" focusable="false">
            <polygon points={face.polygon} />
            <text
              x={face.text[0]}
              y={face.text[1]}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {face.label}
            </text>
          </svg>
        </button>
      ))}
      <button
        type="button"
        className="cube-home"
        aria-label="等轴测视图"
        title="等轴测 (1)"
        disabled={disabled}
        onClick={() => onViewChange("iso")}
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}
