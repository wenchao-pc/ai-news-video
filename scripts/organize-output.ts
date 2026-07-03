/**
 * organize-output.ts — 整理输出目录结构
 *
 * 将散落的输出文件归类到结构化目录:
 *   output/
 *     cover.png           ← 视频封面
 *     data/
 *       news-data.json    ← 数据源
 *       scripts.json      ← 口播稿
 *       transitions.json  ← 转场配置
 *     slides/             ← PPT 页面 PNG + manifest.json
 *     audio/              ← MP3 音频
 *     clips/              ← 单段 MP4 (中间产物)
 *     final.mp4           ← 最终视频
 */

import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "output");

const STRUCTURE = {
  "data": ["news-data.json", "scripts.json", "transitions.json"],
  "slides": null,  // 整个目录
  "audio": null,   // 整个目录
  "clips": null,   // 临时段
};

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function moveIfExists(src: string, dstDir: string) {
  if (fs.existsSync(src)) {
    const name = path.basename(src);
    fs.renameSync(src, path.join(dstDir, name));
  }
}

function copyIfExists(src: string, dstDir: string) {
  if (fs.existsSync(src)) {
    const name = path.basename(src);
    fs.copyFileSync(src, path.join(dstDir, name));
  }
}

// 整理
const dataDir = path.join(OUTPUT, "data");
ensureDir(dataDir);

// 移动数据文件
for (const f of ["news-data.json"]) {
  moveIfExists(path.join(OUTPUT, f), dataDir);
}
// 复制 scripts.json 和 transitions.json（audio 目录也保留一份）
for (const f of ["scripts.json", "transitions.json"]) {
  const src = path.join(OUTPUT, "audio", f);
  copyIfExists(src, dataDir);
}

// cover.png 留在 output 根目录
console.log("✅ 目录整理完毕");
console.log(`   📁 ${OUTPUT}/`);
console.log(`   ├── cover.png`);
console.log(`   ├── final.mp4`);
console.log(`   ├── data/ (news-data.json, scripts.json, transitions.json)`);
console.log(`   ├── slides/ (PNG + manifest.json)`);
console.log(`   └── audio/ (MP3)`);
