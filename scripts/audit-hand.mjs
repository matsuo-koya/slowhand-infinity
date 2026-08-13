/* ============================================================================
   audit-hand.mjs — 左手の全数検査
   `npm run audit:hand`

   指板に描いている運指を、実際に左手が辿れるかどうかで検査する。
   ソロは弾ける必要がある。絵だけが正しくても意味がない。
   ----------------------------------------------------------------------------
   判定:
     手は4フレット幅(第8フレット以上はフレットが狭くなるので5フレット)。
     ポジションの外へ出る音は移動を要求する。移動が
       - スライド系の奏法(sl / gl1 / gl2 / gv1 / gv2 / sd2 / sd3)で覆われている
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

const GTR_OPENS = lit(/const GTR_OPENS = \[[^\]]*\];/, "const GTR_OPENS =");
const GTR_FRETS = Number(grab(/const GTR_FRETS = \d+/).match(/\d+/)[0]);
const N_FRETS = GTR_FRETS;
const SLIDES = new Set(["sl", "gl1", "gl2", "gv1", "gv2", "sd2", "sd3"]);
const spanAt = (f) => (f >= 8 ? 5 : 4);

/* 運指の解決はアプリ本体の gtrPos をそのまま使う。検査と実物で規則がずれないように */
const gtrPos = new Function("POS", "GTR_OPENS", "GTR_FRETS",
  grab(/function gtrPos\(s, keyMidi, octAdj = 0\) \{[\s\S]*?\n\}/) + "\nreturn gtrPos;")(POS, GTR_OPENS, GTR_FRETS);

function boxAdjust(fretOff) {
  let a = 0;
  const base = POS[0][1] + fretOff;
  while (base + a < 1) a += 12;
  while (base + a > N_FRETS - 6) a -= 12;
  return a;
}
const fingering = (s, keyMidi, adj) => gtrPos(s, keyMidi, adj);

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
