/* ============================================================================
   audit-hand.mjs — 左手の全数検査
   `npm run audit:hand`

   指板に描いている運指を、実際に左手が辿れるかどうかで検査する。
   ソロは弾ける必要がある。絵だけが正しくても意味がない。
   ----------------------------------------------------------------------------
   判定:
     手は4フレット幅(第8フレット以上はフレットが狭くなるので5フレット)。
     ポジションの外へ出る音は移動を要求する。移動が
       - スライド系の奏法(sl / gl1 / gl2 / gv1 / gv2)で覆われている
       - 間合いが2単位(3連8分2つ)以上ある
     のいずれでもなく、3フレット以上動く場合を「覆われていない移動」とする。
   ============================================================================ */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "App.jsx"), "utf8");
const grab = (re) => { const m = src.match(re); if (!m) throw new Error("見つからない: " + re); return m[0]; };
const lit = (re, name) => eval("(" + grab(re).replace(name, "").replace(/;$/, "") + ")");

const LICKS = lit(/const LICKS = \[[\s\S]*?\n\];/, "const LICKS =");
const POS = lit(/const POS = \{[\s\S]*?\n\};/, "const POS =");
const KEYS = lit(/const KEYS = \[[\s\S]*?\n\];/, "const KEYS =");

const OPENS = [64, 59, 55, 50, 45, 40]; // 1弦→6弦の開放音
const N_FRETS = 20;
const SLIDES = new Set(["sl", "gl1", "gl2", "gv1", "gv2"]);
const spanAt = (f) => (f >= 8 ? 5 : 4);

/* 描画と同じ運指解決。箱ごとにひとつのオクターヴ補正を持つ */
function boxAdjust(fretOff) {
  let a = 0;
  const base = POS[0][1] + fretOff;
  while (base + a < 1) a += 12;
  while (base + a > N_FRETS - 6) a -= 12;
  return a;
}
function fingering(s, keyMidi, adj) {
  const fretOff = keyMidi - 57;
  if (s >= -2) {
    const p = POS[s] || (POS[s - 1] && [POS[s - 1][0], POS[s - 1][1] + 1]);
    if (!p) return null;
    let fr = p[1] + fretOff + adj;
    if (fr < 0) fr += 12;
    if (fr > N_FRETS) fr -= 12;
    return { str: p[0], fret: fr };
  }
  const m = keyMidi + s;
  let best = null;
  for (let sn = 6; sn >= 1; sn--) {
    const fr = m - OPENS[sn - 1];
    if (fr < 0 || fr > N_FRETS) continue;
    if (fr === 0) return { str: sn, fret: 0 };
    if (!best || fr < best.fret) best = { str: sn, fret: fr };
  }
  return best;
}

function auditLick(evs, keyMidi, adj) {
  const out = { notes: 0, shifts: 0, uncovered: [], unresolved: 0 };
  let pos = null, prev = null;
  for (const e of [...evs].sort((a, b) => a.t - b.t)) {
    const f = fingering(e.s, keyMidi, adj);
    if (!f) { out.unresolved++; continue; }
    out.notes++;
    if (f.fret > 0) {
      const sp = spanAt(f.fret);
      if (pos === null) pos = Math.max(1, f.fret - sp + 1);
      if (f.fret < pos || f.fret > pos + sp - 1) {
        const gap = prev ? e.t - prev.t : 99;
        const dist = f.fret < pos ? pos - f.fret : f.fret - (pos + sp - 1);
        out.shifts++;
        if (dist >= 3 && gap <= 1 && !SLIDES.has(e.a)) out.uncovered.push({ dist, gap, art: e.a || "-", fret: f.fret });
        pos = f.fret < pos ? Math.max(1, f.fret) : Math.max(1, f.fret - sp + 1);
      }
    }
    prev = e;
  }
  return out;
}

let notes = 0, shifts = 0, unresolved = 0;
const uncovered = [];
for (const k of KEYS) {
  const adj = boxAdjust(k.midi - 57);
  for (const L of LICKS) {
    const r = auditLick(L.ev, k.midi, adj);
    notes += r.notes; shifts += r.shifts; unresolved += r.unresolved;
    r.uncovered.forEach((u) => uncovered.push({ ...u, key: k.label || k.midi }));
  }
}
const pct = (v) => `${((v / notes) * 100).toFixed(2)}%`;
console.log(`リック ${LICKS.length}本 × 調 ${KEYS.length}種 = 音 ${notes}`);
console.log(`ポジション移動           ${shifts} (${pct(shifts)})`);
console.log(`覆われていない移動       ${uncovered.length} (${pct(uncovered.length)})`);
if (uncovered.length) {
  const d = uncovered.map((u) => u.dist);
  console.log(`  平均 ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1)} フレット / 最大 ${Math.max(...d)} フレット`);
  const byArt = {};
  uncovered.forEach((u) => (byArt[u.art] = (byArt[u.art] || 0) + 1));
  console.log(`  奏法別: ${Object.entries(byArt).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a}=${n}`).join(" ")}`);
}
console.log(`運指が解けない音         ${unresolved} (${pct(unresolved)})`);

const LIMIT = 0.03; // 覆われていない移動は3%まで
const rate = uncovered.length / notes;
console.log(`\n${rate <= LIMIT ? "○ 合格" : "★ 不合格"} — 基準 ${(LIMIT * 100).toFixed(0)}% に対し ${(rate * 100).toFixed(2)}%`);
process.exit(rate <= LIMIT ? 0 : 1);
