#!/usr/bin/env node
/**
 * make-video.ts — 一键编排: 数据 → PPT → 音频 → 视频
 *
 * 用法:
 *   npx tsx scripts/make-video.ts                           # 用 mock 数据 + terminal 模板
 *   npx tsx scripts/make-video.ts --data my-news.json       # 指定数据
 *   npx tsx scripts/make-video.ts --template hud            # 指定模板
 *   npx tsx scripts/make-video.ts --voice "female-chengshu" # 指定音色
 *   npx tsx scripts/make-video.ts --transition fade         # 指定转场
 *   npx tsx scripts/make-video.ts --skip-ppt                # 跳过 PPT 生成（复用已有 PNG）
 *   npx tsx scripts/make-video.ts --skip-audio              # 跳过音频生成
 *
 * 所有参数会透传给对应的子脚本。
 */

import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── 解析参数 ──
const rawArgs = process.argv.slice(2);

function hasFlag(flag: string): boolean {
  return rawArgs.includes(flag);
}

function getParam(key: string): string | undefined {
  const i = rawArgs.indexOf(`--${key}`);
  return i >= 0 ? rawArgs[i + 1] : undefined;
}

// ── 配置 ──
const data = getParam("data") || path.join(ROOT, "examples", "mock-news.json");
const template = getParam("template") || "terminal";
const voice = getParam("voice") || "Chinese (Mandarin)_Southern_Young_Man";
const transition = getParam("transition") || "random";
const transitionDur = getParam("transition-dur") || "1.0";
const skipPpt = hasFlag("--skip-ppt");
const skipAudio = hasFlag("--skip-audio");
const skipVideo = hasFlag("--skip-video");

const slidesDir = path.join(ROOT, "output", "slides");
const audioDir = path.join(ROOT, "output", "audio");
const finalOut = getParam("out") || path.join(ROOT, "output", "final.mp4");

// ── 工具 ──
function runStep(label: string, cmd: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log(`${"═".repeat(60)}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

// ── 主流程 ──
const totalStart = Date.now();
console.log("🎬 News Brief Video — 一键生成");
console.log(`   数据: ${data}`);
console.log(`   模板: ${template}`);
console.log(`   音色: ${voice}`);
console.log(`   转场: ${transition} (${transitionDur}s)`);

// Step 1: PPT
if (!skipPpt) {
  runStep("Step 1/3: 生成 PPT 图片",
    `npx tsx scripts/generate-ppt.ts --data "${data}" --template ${template} --out "${slidesDir}"`
  );
} else {
  console.log("\n⏭ 跳过 PPT 生成");
}

// Step 2: Audio
if (!skipAudio) {
  runStep("Step 2/3: 生成语音音频",
    `npx tsx scripts/generate-audio.ts --data "${data}" --out "${audioDir}" --voice "${voice}"`
  );
} else {
  console.log("\n⏭ 跳过音频生成");
}

// Step 3: Video
if (!skipVideo) {
  runStep("Step 3/3: 合成最终视频",
    `npx tsx scripts/compose-video.ts --slides "${slidesDir}" --audio "${audioDir}" --out "${finalOut}" --transition ${transition} --transition-dur ${transitionDur}`
  );
} else {
  console.log("\n⏭ 跳过视频合成");
}

const elapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
console.log(`\n${"═".repeat(60)}`);
console.log(`🎉 全部完成！耗时 ${elapsed}s`);
console.log(`📁 输出: ${finalOut}`);
if (fs.existsSync(finalOut)) {
  const size = (fs.statSync(finalOut).size / 1024 / 1024).toFixed(1);
  console.log(`📦 大小: ${size} MB`);
}
console.log(`${"═".repeat(60)}`);
