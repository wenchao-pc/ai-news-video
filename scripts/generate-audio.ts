/**
 * 音频生成 V3 — 直接从数据文件读取口播稿，只调 mmx TTS 合成 MP3
 *
 * 改动: 口播稿和转场效果由 AI Agent 在上游生成，写入 JSON 数据文件
 *       本脚本只负责 TTS 合成
 *
 * 用法:
 *   tsx scripts/generate-audio.ts --data examples/mock-news.json --out output/audio
 *
 * 数据文件需包含:
 *   - intro.script / outro.script: 片头片尾口播稿
 *   - items[].script: 每条口播稿
 *   - transitions[]: 转场效果列表
 */

import { execSync, execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_VOICE = "Chinese (Mandarin)_Southern_Young_Man";

// ── CLI ──
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string, d?: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : d;
  };
  return {
    data: get("data", path.join(ROOT, "examples", "mock-news.json")),
    out: get("out", path.join(ROOT, "output", "audio")),
    voice: get("voice", DEFAULT_VOICE),
    model: get("model", "speech-2.8-hd"),
  };
}

// ── 调用 mmx TTS (写临时文件传文本) ──
function callMmxTTS(text: string, outPath: string, voice: string, model: string) {
  const tmpDir = path.join(ROOT, "output", "_tmp_tts");
  fs.mkdirSync(tmpDir, { recursive: true });
  const textFile = path.join(tmpDir, `tts_${Date.now()}.txt`);
  fs.writeFileSync(textFile, text);

  try {
    execFileSync("mmx", [
      "speech", "synthesize",
      "--text-file", textFile,
      "--voice", voice,
      "--model", model,
      "--out", outPath,
      "--quiet",
    ], {
      encoding: "utf-8",
      timeout: 60000,
    });
  } finally {
    try { fs.unlinkSync(textFile); } catch {}
  }
}

// ── 带重试 ──
function withRetry<T>(fn: () => T, label: string, maxRetries = 3): T {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (e: any) {
      lastErr = e;
      if (attempt < maxRetries) {
        const wait = 3 * attempt;
        console.log(`  ⚠ ${label} 第 ${attempt} 次失败，${wait}秒后重试...`);
        execSync(`sleep ${wait}`);
      }
    }
  }
  throw lastErr;
}

// ── 主流程 ──
(async () => {
  const { data: dataPath, out: outDir, voice, model } = parseArgs();

  const newsData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  fs.mkdirSync(outDir, { recursive: true });

  const scriptsLog: { file: string; title: string; script: string }[] = [];

  // ═══ 片头 ═══
  if (newsData.intro?.script) {
    const text = newsData.intro.script;
    console.log(`🎵 [intro] ${text.substring(0, 50)}...`);
    withRetry(() => callMmxTTS(text, path.join(outDir, "00_intro.mp3"), voice, model), "TTS[intro]");
    console.log(`✔ 00_intro.mp3`);
    scriptsLog.push({ file: "00_intro.mp3", title: "片头", script: text });
  }

  // ═══ 内容页 ═══
  for (let i = 0; i < newsData.items.length; i++) {
    const item = newsData.items[i];
    const num = String(i + 1).padStart(2, "0");
    const text = item.script || item.raw_text || item.subtitle || "";

    if (!text) {
      console.log(`⚠ [${num}] 无口播稿，跳过`);
      continue;
    }

    console.log(`🎵 [${num}] ${item.title}: ${text.substring(0, 50)}...`);
    withRetry(() => callMmxTTS(text, path.join(outDir, `${num}_slide.mp3`), voice, model), `TTS[${num}]`);
    console.log(`✔ ${num}_slide.mp3`);
    scriptsLog.push({ file: `${num}_slide.mp3`, title: item.title, script: text });
  }

  // ═══ 片尾 ═══
  if (newsData.outro?.script) {
    const text = newsData.outro.script;
    console.log(`🎵 [outro] ${text.substring(0, 40)}...`);
    withRetry(() => callMmxTTS(text, path.join(outDir, "99_outro.mp3"), voice, model), "TTS[outro]");
    console.log(`✔ 99_outro.mp3`);
    scriptsLog.push({ file: "99_outro.mp3", title: "片尾", script: text });
  }

  // ═══ 直接复制 transitions.json ═══
  if (newsData.transitions) {
    fs.writeFileSync(path.join(outDir, "transitions.json"), JSON.stringify(newsData.transitions, null, 2));
    console.log(`📋 转场配置: ${newsData.transitions.length} 条`);
  }

  // ═══ 写出 scripts.json ═══
  fs.writeFileSync(path.join(outDir, "scripts.json"), JSON.stringify(scriptsLog, null, 2));
  console.log(`\n✅ 音频生成完毕 → ${outDir}`);
  console.log(`   音频: ${scriptsLog.length} 条`);
})();
