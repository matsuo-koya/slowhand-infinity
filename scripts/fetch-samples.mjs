// サンプル音源の取得スクリプト
// 用途: npm run fetch-samples
// Salamander Grand Piano(CC BY 3.0)とguitar-electric(CC BY 3.0)の
// サンプルをローカルに配置し、完全オフライン再生を可能にする。
// ライセンスと出典は CREDITS.md を参照。
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const SETS = [
  {
    dir: "public/salamander",
    base: "https://tonejs.github.io/audio/salamander/",
    files: ["A2", "C3", "Fs3", "A3", "C4", "Fs4", "A4", "C5"],
  },
  {
    dir: "public/guitar-electric",
    base: "https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/guitar-electric/",
    files: ["E2", "A2", "C3", "Fs3", "A3", "C4", "Fs4", "A4", "C5", "Ds5", "A5", "C6"],
  },
];

let ok = 0, ng = 0;
for (const set of SETS) {
  await mkdir(set.dir, { recursive: true });
  for (const name of set.files) {
    const url = `${set.base}${name}.mp3`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error(`suspiciously small (${buf.length} bytes)`);
      await writeFile(join(set.dir, `${name}.mp3`), buf);
      console.log(`ok  ${set.dir}/${name}.mp3 (${(buf.length / 1024).toFixed(0)} KB)`);
      ok++;
    } catch (e) {
      console.error(`NG  ${url}: ${e.message}`);
      ng++;
    }
  }
}
console.log(`\n${ok} 個取得${ng ? `、${ng} 個失敗` : ""}。`);
if (ng) {
  console.error("失敗があってもアプリは動きます(該当楽器はシンセ合成にフォールバック)。");
  process.exit(1);
}
