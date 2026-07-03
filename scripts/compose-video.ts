/**
 * 视频合成 — 将 PNG 图片 + MP3 音频 → 单段 MP4 → xfade 多转场拼接 → 最终视频
 *
 * 用法:
 *   tsx scripts/compose-video.ts --slides output/slides --audio output/audio --out output/final.mp4
 *
 * 流程:
 *   1. 对每页: PNG + MP3 → 单段 MP4 (图片长度 = 音频长度)
 *   2. 所有单段 MP4 用 xfade 随机转场效果拼接
 *   3. 输出最终 MP4
 *
 * CLI 参数:
 *   --slides <dir>     PNG 目录 (默认 output/slides)
 *   --audio <dir>      MP3 目录 (默认 output/audio)
 *   --out <path>       输出视频路径 (默认 output/final.mp4)
 *   --transition <t>   转场效果: random/fade/slide/wipe/zoom (默认 random)
 *   --transition-dur <s>  转场时长 (默认 0.5秒)
 */

import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── 转场效果池 ──
const TRANSITIONS = [
  "fade", "slideleft", "slideright", "slideup", "slidedown",
  "wipeleft", "wiperight", "wipeup", "wipedown",
  "circleopen", "circleclose",
  "zoomin",
  "dissolve",
  "horzopen", "vertopen",
];

// ── 转场选择: 优先从 transitions.json 读取(LLM推荐)，否则按模式选择 ──
let llmTransitions: string[] = []; // 每个拼接点的转场效果

function loadTransitions(audioDir: string, count: number, mode: string): string[] {
  // 尝试读取 LLM 推荐的转场
  const transFile = path.join(audioDir, "transitions.json");
  if (fs.existsSync(transFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(transFile, "utf-8"));
      // 兼容两种格式：字符串数组 ["fade",...] 或对象数组 [{transition:"fade"},...]
      const result = data.map((t: any) => {
        if (typeof t === "string") return TRANSITIONS.includes(t) ? t : "fade";
        if (t.transition && TRANSITIONS.includes(t.transition)) return t.transition;
        return "fade";
      });
      if (result.length >= count) {
        console.log(`  📋 使用 LLM 推荐转场: ${result.slice(0, count).join(", ")}`);
        return result.slice(0, count);
      }
    } catch {}
  }
  // fallback: 按 mode 选择
  if (mode === "random") {
    return Array.from({ length: count }, (_, i) => TRANSITIONS[i % TRANSITIONS.length]);
  }
  return Array.from({ length: count }, () => mode);
}

// ── 获取音频时长 (秒) ──
function getAudioDuration(audioPath: string): number {
  try {
    const out = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    return parseFloat(out);
  } catch {
    // fallback: 用 ffmpeg -i 解析 Duration（ffprobe 不可用时）
    const out = execSync(
      `ffmpeg -i "${audioPath}" 2>&1 || true`,
      { encoding: "utf-8" }
    );
    const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
    return 0;
  }
}

// ── CLI ──
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string, d?: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : d;
  };
  return {
    slides: get("slides", path.join(ROOT, "output", "slides")),
    audio: get("audio", path.join(ROOT, "output", "audio")),
    out: get("out", path.join(ROOT, "output", "final.mp4")),
    transition: get("transition", "random"),
    transitionDur: parseFloat(get("transition-dur", "1.0")),
  };
}

// ── 主流程 ──
(async () => {
  const { slides: slidesDir, audio: audioDir, out: finalOut, transition, transitionDur: td } = parseArgs();

  // 加载 manifest
  const manifestPath = path.join(slidesDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`✘ 找不到 manifest.json，请先运行 generate-ppt.ts`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  // 加载转场效果
  const segmentCount = manifest.length;
  const transitionList = loadTransitions(audioDir, segmentCount - 1, transition);

  // 临时目录
  const tmpDir = path.join(ROOT, "output", "_tmp_segments");
  fs.mkdirSync(tmpDir, { recursive: true });

  // ── Step 1: 每页 → 单段 MP4 ──
  console.log("━━━ Step 1: 生成单段视频 ━━━");

  const segments: { file: string; duration: number }[] = [];

  for (const page of manifest) {
    const pngPath = path.join(slidesDir, page.png);
    const audioPath = path.join(audioDir, page.audio);

    if (!fs.existsSync(pngPath)) {
      console.error(`✘ 图片不存在: ${pngPath}`);
      continue;
    }
    if (!fs.existsSync(audioPath)) {
      console.error(`✘ 音频不存在: ${audioPath}，跳过此页`);
      continue;
    }

    const duration = getAudioDuration(audioPath);
    const segFile = path.join(tmpDir, page.png.replace(".png", ".mp4"));

    // 图片 + 音频 → MP4
    execSync(
      `ffmpeg -y -loop 1 -i "${pngPath}" -i "${audioPath}" ` +
      `-c:v libx264 -tune stillimage -pix_fmt yuv420p -r 30 ` +
      `-c:a aac -b:a 128k -shortest ` +
      `-vf "scale=1920:1080" ` +
      `"${segFile}"`,
      { stdio: "pipe" }
    );

    const label = `${page.type}_${page.index}`;
    console.log(`  ✔ ${label} (${duration.toFixed(1)}s)`);
    segments.push({ file: segFile, duration });
  }

  if (segments.length < 2) {
    console.error("✘ 至少需要 2 段视频才能拼接");
    process.exit(1);
  }

  // ── Step 2: 拼接（先停顿1秒，再转场）──
  console.log(`\n━━━ Step 2: 拼接 (${segments.length}段, 停顿1s + 转场${td}s) ━━━`);

  // 策略：
  // 1. 每段视频尾部加 (1秒停顿 + td秒转场区) 的冻结帧 + 静音
  // 2. 视频用 xfade 转场，offset 落在尾延最末 td 秒
  // 3. 音频用 concat 直接拼接（不做 acrossfade），避免转场期间音频被淡入

  const pauseDur = 1.0; // 停顿 1 秒
  const padDur = pauseDur + td; // 总尾延

  const tmpDir2 = path.join(ROOT, "output", "_tmp_padded");
  fs.mkdirSync(tmpDir2, { recursive: true });

  // Step 2a: 给每段视频加尾延
  // seg 0: 末尾加 padDur=2s（1s 停顿 + 1s acrossfade 区）
  // seg i>0: 开头加 td=1s 静音冻结帧 + 末尾加 pauseDur=1s
  //   → acrossfade d=td 交叉淡化的是 silence→silence，不会有音量衰减
  console.log("  给每段加 padding（seg0 尾延 2s / 其他 前置 1s + 尾延 1s）...");
  const paddedSegs: { file: string; duration: number }[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const paddedFile = path.join(tmpDir2, `padded_${i}.mp4`);

    if (i === 0) {
      // seg 0: 只加末尾 padDur
      execSync(
        `ffmpeg -y -i "${seg.file}" ` +
        `-vf "tpad=stop_mode=clone:stop_duration=${padDur}" ` +
        `-af "apad=pad_dur=${padDur}" ` +
        `-c:v libx264 -pix_fmt yuv420p -r 30 -crf 23 -preset fast ` +
        `-c:a aac -b:a 128k -shortest "${paddedFile}"`,
        { stdio: "pipe" }
      );
    } else {
      // seg i>0: 前置 td 秒 + 末尾 pauseDur 秒
      execSync(
        `ffmpeg -y -i "${seg.file}" ` +
        `-vf "tpad=start_mode=clone:start_duration=${td}:stop_mode=clone:stop_duration=${pauseDur}" ` +
        `-af "adelay=${Math.round(td * 1000)}|${Math.round(td * 1000)},apad=pad_dur=${pauseDur}" ` +
        `-c:v libx264 -pix_fmt yuv420p -r 30 -crf 23 -preset fast ` +
        `-c:a aac -b:a 128k -shortest "${paddedFile}"`,
        { stdio: "pipe" }
      );
    }
    paddedSegs.push({ file: paddedFile, duration: seg.duration + padDur });
  }

  // Step 2b: xfade（视频）+ acrossfade（音频）拼接
  // acrossfade d=td：因为前置 padding 是静音，交叉淡化的是 silence→silence，音量不衰减
  let filter = "";
  const inputs = paddedSegs.map((s, i) => `-i "${s.file}"`).join(" ");

  let cumulativeDur = paddedSegs[0].duration;
  let prevVideoLabel = "[0:v]";
  let prevAudioLabel = "[0:a]";

  for (let i = 1; i < paddedSegs.length; i++) {
    const offset = Math.max(0, cumulativeDur - td);
    const trans = transitionList[i - 1] || "fade";
    const vOut = i < paddedSegs.length - 1 ? `[v${i}]` : "[vout]";
    const aOut = i < paddedSegs.length - 1 ? `[a${i}]` : "[aout]";

    filter += `${prevVideoLabel}[${i}:v]xfade=transition=${trans}:duration=${td}:offset=${offset.toFixed(3)}${vOut};`;
    filter += `${prevAudioLabel}[${i}:a]acrossfade=d=${td}:c1=tri:c2=tri${aOut};`;

    prevVideoLabel = vOut;
    prevAudioLabel = aOut;
    cumulativeDur += paddedSegs[i].duration - td;
  }

  filter = filter.replace(/;$/, "");

  const totalDur = cumulativeDur;
  console.log(`  预计总时长: ${totalDur.toFixed(1)}s`);

  const ffmpegCmd =
    `ffmpeg -y ${inputs} -filter_complex "${filter}" ` +
    `-map "[vout]" -map "[aout]" ` +
    `-c:v libx264 -pix_fmt yuv420p -r 30 -crf 23 -preset medium ` +
    `-c:a aac -b:a 128k ` +
    `-movflags +faststart ` +
    `"${finalOut}"`;

  console.log(`  转场模式: ${transition}`);
  execSync(ffmpegCmd, { stdio: "pipe" });

  // 清理
  fs.rmSync(tmpDir2, { recursive: true, force: true });

  // 清理临时段
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n✅ 视频合成完毕 → ${finalOut}`);
  console.log(`   时长: ${totalDur.toFixed(1)}s | 页数: ${segments.length}`);
})();
