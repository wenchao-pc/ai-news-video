# AI News Video

从飞书文档或 JSON 数据生成 PPT 风格视频的自动化流水线。

> HTML 渲染 PPT 页面 → MiniMax TTS 口播音频 → FFmpeg 转场合成 MP4

## 特性

- 🎨 **三种模板**：terminal（终端风）、hud（赛博 HUD）、minimal（极简）
- 🎙️ **TTS 配音**：通过 `mmx-cli` 调用 MiniMax 语音合成
- 🎬 **转场效果**：基于 FFmpeg `xfade`，支持 fade / slide / wipe / zoom 等
- 📦 **一键编排**：`make-video.ts` 自动串联所有步骤
- 🕒 **每次运行独立输出目录**：自动按时间戳归档，互不覆盖

## 快速开始

### 安装依赖

```bash
npm install
```

完整流程需要以下外部命令，请确保已安装：

- `npx tsx` — TypeScript 直接执行
- `mmx` — MiniMax TTS（`npm install -g mmx-cli`）
- `lark-cli` — 飞书文档抓取（可选）
- `ffmpeg` — 视频合成（需支持 `xfade` 滤镜，4.3+）

### 完整流程

```bash
cd ~/.hermes/skills/ai-news-video

# 1. 抓取飞书文档（可选，可跳过用 mock 数据）
npx tsx scripts/fetch-feishu.ts --url "https://xxx.feishu.cn/docx/TOKEN" --max-items 30

# ⚠ Agent 读取 output/news-data.json，为每条 raw_text 生成 script 和 transitions

# 2. 一键生成视频
npx tsx scripts/make-video.ts

# 3. 指定参数
npx tsx scripts/make-video.ts --template hud --voice "Chinese (Mandarin)_Southern_Young_Man"
```

### 用 mock 数据快速测试

```bash
npx tsx scripts/make-video.ts
```

### 只重新合成视频

```bash
npx tsx scripts/make-video.ts --skip-ppt --skip-audio
```

## 输出结构

每次运行 `make-video.ts` 会生成**独立的时间戳目录**，保留所有中间产物：

```
output/
└── run-20260703-104001/        ← 每次运行一个独立目录
    ├── slides/                 ← PPT PNG 页面（每页一张）
    │   ├── 00_intro.png
    │   ├── 01_xxx.png
    │   ├── 99_outro.png
    │   └── manifest.json
    ├── audio/                  ← TTS 口播音频（每页一段 MP3）
    │   ├── 00_intro.mp3
    │   ├── 01_xxx.mp3
    │   └── 99_outro.mp3
    └── final.mp4               ← 最终视频
```

**默认行为**：输出到 `output/run-YYYYMMDD-HHmmss/`，多次运行互不覆盖。

**自定义输出**：通过 `--out <path>` 指定完整输出文件路径，会跳过独立目录逻辑：

```bash
npx tsx scripts/make-video.ts --out /tmp/my-video.mp4
```

## 子脚本

| 脚本 | 作用 | 关键参数 |
|---|---|---|
| `fetch-feishu.ts` | 从飞书文档 URL 抓取并解析为 JSON | `--url`, `--max-items`, `--out` |
| `generate-ppt.ts` | 渲染 HTML 模板 → PNG（Playwright） | `--data`, `--template`, `--out` |
| `generate-audio.ts` | 调用 mmx TTS 生成口播音频 | `--data`, `--out`, `--voice` |
| `compose-video.ts` | FFmpeg xfade 合成最终视频 | `--slides`, `--audio`, `--out`, `--transition` |
| `organize-output.ts` | 把散落产物整理到结构化目录 | — |
| `preview-templates.ts` | 预览所有模板的渲染效果 | — |
| `make-video.ts` | 一键编排（fetch → ppt → audio → video） | 透传所有子参数 |

## 模板

每个模板在 `templates/<name>/` 下有独立目录：

```
templates/terminal/
├── config.json
├── cover.html
├── intro.html
├── slide.html
└── outro.html
```

可用模板：`terminal`（默认）、`hud`、`minimal`。

## 数据格式

输入 JSON 形如 `examples/mock-news.json`：

```json
{
  "title": "今日 AI 速报",
  "items": [
    {
      "raw_text": "DeepSeek-V3.5 今日发布...",
      "script": "今天有个项目直接杀疯了...",
      "transitions": { "in": "fade", "out": "slide", "duration": 1.0 }
    }
  ]
}
```

- `raw_text`：原文（来源文档）
- `script`：口播稿（由 Agent 改写为口语化文案）
- `transitions`：可选，转场配置

## 配置

`.env`（可选）：

```bash
# MiniMax TTS（也可使用 ~/.mmx/config.json）
MINIMAX_API_KEY=...
MINIMAX_VOICE=Chinese (Mandarin)_Southern_Young_Man
```

## 常见问题

- **音频生成空字符串**：检查 `references/mmx-pitfalls.md`，推理模型会消耗 token 在 thinking 上
- **Playwright 安装失败**：`npx playwright install chromium`
- **FFmpeg xfade 不支持**：升级到 ffmpeg 4.3+

## 许可

MIT