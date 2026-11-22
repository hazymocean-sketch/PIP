/**
 * MOOG-style stat: black knob with a tick ring that fills in Klein blue,
 * plus a dot-matrix numeral. Pure SVG + CSS animation (server-rendered).
 */
import Link from "next/link";
import { Hint } from "./client";

/* 5×7 dot-matrix glyphs (rows top→bottom, 1 = lit) */
const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "%": ["11000", "11001", "00010", "00100", "01000", "10011", "00011"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

export function DotDigits({ value, dot = 4.2, gap = 1.9 }: { value: string; dot?: number; gap?: number }) {
  const chars = value.split("").filter((c) => GLYPHS[c]);
  const step = dot + gap;
  const charW = 5 * step;
  const w = chars.length * (charW + step) - step;
  const h = 7 * step - gap;
  return (
    <svg className="dots" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={value}>
      {chars.map((c, ci) =>
        GLYPHS[c].flatMap((row, ri) =>
          row.split("").map((bit, bi) => (
            <circle key={`${ci}-${ri}-${bi}`} cx={ci * (charW + step) + bi * step + dot / 2} cy={ri * step + dot / 2} r={dot / 2}
              className={bit === "1" ? "on" : "off"} style={bit === "1" ? { animationDelay: `${(ci * 5 + bi) * 12 + ri * 8}ms` } : undefined} />
          )),
        ),
      )}
    </svg>
  );
}

const TICKS = 41;
const SWEEP = 270;

export function Knob({ ratio, size = 92 }: { ratio: number; size?: number }) {
  const r = Math.max(0, Math.min(1, ratio));
  const lit = Math.round(r * (TICKS - 1));
  const angle = -SWEEP / 2 + r * SWEEP;
  const c = 50;
  return (
    <svg className="knob" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ ["--knob-angle" as string]: `${angle}deg` }}>
      <defs>
        <radialGradient id="kg" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#4a4a48" />
          <stop offset="45%" stopColor="#1a1a19" />
          <stop offset="100%" stopColor="#050505" />
        </radialGradient>
      </defs>
      {Array.from({ length: TICKS }, (_, i) => {
        const a = ((-SWEEP / 2 + (i / (TICKS - 1)) * SWEEP) * Math.PI) / 180;
        const major = i === Math.floor(TICKS / 2) || i === 0 || i === TICKS - 1;
        const r1 = major ? 39 : 41, r2 = 46;
        return (
          <line key={i} x1={c + r1 * Math.sin(a)} y1={c - r1 * Math.cos(a)} x2={c + r2 * Math.sin(a)} y2={c - r2 * Math.cos(a)}
            className={i <= lit && r > 0 ? "tick lit" : "tick"} style={i <= lit && r > 0 ? { animationDelay: `${i * 18}ms` } : undefined} />
        );
      })}
      <circle cx={c} cy={c} r="31" className="knob-shadow" />
      <circle cx={c} cy={c} r="29" fill="url(#kg)" />
      <circle cx={c} cy={c} r="28.4" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth=".8" />
      <circle cx={c} cy={c} r="3.2" fill="#000" />
      <g className="knob-pointer">
        <line x1={c} y1={c - 10} x2={c} y2={c - 24} stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx={c} cy={c - 36} r="1.9" className="knob-dot" />
      </g>
    </svg>
  );
}

/** Saturating ratio so small counts still move the dial. */
export function dial(v: number, k = 10) { return v <= 0 ? 0 : 1 - Math.exp(-v / k); }

export function KnobStat({ label, value, ratio, unit, href, hint, sub }: { label: string; value: number | string; ratio: number; unit?: string; href?: string; hint?: string; sub?: string }) {
  const inner = (
    <>
      <Knob ratio={ratio} />
      <div className="knob-txt">
        <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "nowrap" }}><DotDigits value={String(value)} />{unit ? <span className="knob-unit">{unit}</span> : null}</div>
        <div className="knob-label">{label}{hint ? <Hint text={hint} /> : null}</div>
        {sub ? <div className="knob-sub">{sub}</div> : null}
      </div>
    </>
  );
  return href ? <Link href={href} className="card knob-stat">{inner}</Link> : <div className="card knob-stat">{inner}</div>;
}
