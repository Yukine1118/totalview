import { formatTaipei } from "@/lib/freshness";
import { fmtMoney } from "@/lib/portfolio";
import type { EquityPoint } from "@/lib/types";

function toPoints(values: number[], w: number, h: number, pad: number): string[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rng = max - min || 1;
  return values.map(
    (v, i) =>
      `${((i / (values.length - 1)) * (w - pad * 2) + pad).toFixed(1)},${(h - pad - ((v - min) / rng) * (h - pad * 2)).toFixed(1)}`,
  );
}

/** 迷你曲線(沿用 v1):漲綠跌紅,最後一點加圓點 */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span className="text-muted">—</span>;
  const W = 110;
  const H = 30;
  const pts = toPoints(values, W, H, 3);
  const up = values[values.length - 1] >= values[0];
  const color = up ? "var(--ok)" : "var(--stop)";
  const [lx, ly] = pts[pts.length - 1].split(",");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-[30px] w-[110px]" role="img" aria-label={label}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx={lx} cy={ly} r="2.6" fill={color} />
    </svg>
  );
}

/** 資產曲線:SVG 線圖,文字標籤放在 HTML(手機上不會被縮到看不清楚) */
export function EquityChart({ points, currency, label }: { points: EquityPoint[]; currency: string; label: string }) {
  if (points.length < 2) {
    return <p className="py-6 text-center text-sm text-muted">無資料</p>;
  }
  const values = points.map((p) => p.equity);
  const W = 600;
  const H = 160;
  const pts = toPoints(values, W, H, 4);
  const up = values[values.length - 1] >= values[0];
  const color = up ? "var(--ok)" : "var(--stop)";
  const max = Math.max(...values);
  const min = Math.min(...values);
  return (
    <figure className="m-0">
      <div className="flex justify-between text-xs text-muted">
        <span>
          最高 <span className="num">{fmtMoney(max, currency)}</span>
        </span>
        <span>
          最低 <span className="num">{fmtMoney(min, currency)}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="my-1 block h-auto w-full" role="img" aria-label={label} preserveAspectRatio="none">
        <polygon points={`4,${H - 4} ${pts.join(" ")} ${W - 4},${H - 4}`} fill={color} opacity="0.08" />
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-xs text-muted">
        <span className="num">{formatTaipei(new Date(points[0].at)).split(" ")[0]}</span>
        <span className="num">{formatTaipei(new Date(points[points.length - 1].at)).split(" ")[0]}</span>
      </figcaption>
    </figure>
  );
}
