---
name: ai-news-video
description: 从飞书文档或 JSON 数据生成 PPT 风格视频：HTML 渲染 PPT 页面 → MiniMax TTS 口播音频 → FFmpeg 转场合成 MP4。
version: 0.6.0
tags: [video, tts, ffmpeg, ppt, automation]
---

# AI News Video — PPT 视频生成流水线

从飞书文档采集资讯 → Agent 生成口播稿 → 一键生成 PPT 视频（带字幕、配音、转场）。

## 完整工作流（Agent 执行步骤）

```
飞书文档 → fetch-feishu.ts → news-data.json (raw_text)
                                      ↓
                          Agent 生成 script + transitions + 字段补全
                                      ↓
           make-video.ts（PPT→音频→视频，三步合一）
                                      ↓
           generate-srt.py → 字幕
                                      ↓
           imageio-ffmpeg 烧录硬字幕
```

### Step 1: 抓取飞书文档

```bash
cd ~/.hermes/skills/ai-news-video
npx tsx scripts/fetch-feishu.ts --url "https://xxx.feishu.cn/docx/TOKEN" --max-items 30
```

自动创建 `output/run-YYYYMMDD-HHmmss/` 目录，输出 `news-data.json` 到其中。脚本会打印 run 目录路径。

### Step 2: Agent 生成口播稿 + 转场（写回 JSON）

Agent 读取 `output/run-XXX/news-data.json`，完成以下工作并写回：

1. 为每条 `raw_text` 生成 `script`（口播稿）
2. 生成 `intro.script`、`outro.script`
3. 生成 `transitions[]`（转场效果列表）
4. 补全 `metrics`（至少 3 个）和 `highlights`（正好 3 条）
5. 补全 `intro.title`、`outro.title`

⚠️ **不要用 mmx CLI 调 LLM 生成口播稿**（推理模型 token 消耗大，输出为空）。由 Agent 直接改写。

### Step 3: 生成视频

```bash
npx tsx scripts/make-video.ts --data output/run-XXX/news-data.json
```

输出到同一个 run 目录：`final.mp4`、`cover.png`、`slides/`、`audio/`。

### Step 4: 生成字幕 + 烧录硬字幕

```bash
# 生成 SRT 字幕（无标点，更干净的阅读体验）
python3 scripts/generate-srt.py \
  --data output/run-XXX/news-data.json \
  --audio-dir output/run-XXX/audio \
  --out output/run-XXX/subtitles.srt

# 烧录硬字幕（用 imageio-ffmpeg 的 ffmpeg，自带 libass）
FFMPEG=$(python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
$FFMPEG -y -i output/run-XXX/final.mp4 \
  -vf "subtitles=output/run-XXX/subtitles.srt:force_style='FontName=PingFang SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,MarginV=55'" \
  -c:v libx264 -preset fast -crf 28 -pix_fmt yuv420p \
  -c:a aac -b:a 96k \
  output/run-XXX/final-sub.mp4
```

封面图在 Step 3 生成：`output/run-XXX/cover.png`。

### 其他命令

```bash
# 用 mock 数据测试
npx tsx scripts/make-video.ts

# 只重新合成视频（复用已有 PPT 和音频）
npx tsx scripts/make-video.ts --data output/run-XXX/news-data.json --skip-ppt --skip-audio

# 指定输出路径
npx tsx scripts/make-video.ts --out /tmp/my-video.mp4
```

## 脚本一览

| 脚本 | 功能 |
|------|------|
| `fetch-feishu.ts` | 飞书文档→JSON（提取 raw_text） |
| `make-video.ts` | 一键入口（编排 PPT→音频→视频） |
| `generate-ppt.ts` | 数据→HTML→PNG（含片头/内容/片尾/封面） |
| `generate-audio.ts` | 口播稿→mmx TTS→MP3（支持 `--volume`） |
| `compose-video.ts` | PNG+MP3→FFmpeg→MP4（xfade 转场） |
| `generate-srt.py` | 口播稿+音频时长→SRT 字幕 |

## Agent 生成口播稿的要求

- B站UP主风格，口语化，生动有节奏
- 80-150 字/条（约 15-30 秒口播）
- 开头用不同钩子词（"来看看这个""这个项目有意思"等），不要用"第N条"
- **品牌名：统一用「AI 开源速递」**，不要用"技术情报雷达"等旧名称
- **主题定位：AI 开源项目与开源模型的介绍**
- 片头示例："欢迎来到 AI 开源速递。今天我们介绍 N 个精选的 AI 开源项目和开源模型，覆盖 Agent 框架、新模型和开发者工具三个方向。"
- 片尾示例："今天的 AI 开源速递就到这里。"

### 转场选择

根据相邻内容语义选择：同类用平滑转场（fade/dissolve/smoothleft/slideleft），跨类别或重磅消息用冲击转场（zoomin/circleopen/wipeleft）。

## 数据格式

见 `examples/mock-news.json`。关键字段：

```json
{
  "date": "2026-07-01",
  "intro": { "title": "...", "subtitle": "...", "script": "口播文案" },
  "outro": { "title": "...", "subtitle": "...", "script": "口播文案" },
  "transitions": [
    { "from": "片头", "to": "项目名", "transition": "zoomin" }
  ],
  "items": [
    {
      "category": "🔧 开源与模型",
      "title": "项目名",
      "subtitle": "一句话简介（≤120字，CSS 自动截断）",
      "metrics": { "stars": "5846" },
      "highlights": ["亮点1", "亮点2", "亮点3"],
      "link": "github.com/...",
      "source_label": "GitHub Trending",
      "raw_text": "资讯原文",
      "script": "口播文案"
    }
  ]
}
```

### 数据字段约束

- `metrics`：每条**至少 3 个** key-value 对（不足则从 raw_text 补充 stars/forks/language/downloads/likes 等）
- `highlights`：**正好 3 条**，每条 15-30 字
- `transitions`：效果要**多样化**（兼容字符串数组 `["fade"]` 和对象数组 `[{transition: "fade"}]`）

## 模板

模板可插拔，位于 `templates/` 目录：

| 模板 | 风格 |
|------|------|
| `terminal` | 终端风（黑底+霓虹绿）← 默认 |
| `hud` | HUD 仪表盘风 |
| `minimal` | 极简卡片风 |

模板内的 CSS 参数已经过多轮调优验证，**不要随意改动**。如需调试 CSS，详见 `references/template-css-pitfalls.md`。

## 输出与交付

**每次任务的标准输出格式**（5 项，缺一不可）：

1. **标题**：`AI开源速递-YYYY.MM.DD`
2. **简介**：200 字以内，概括本期亮点
3. **话题**：3-5 个 `#话题标签`，提炼本期关键词
4. **封面图**：MEDIA: cover.png
5. **视频**：MEDIA: final-sub.mp4（带硬字幕版）

- 视频默认直接发给用户，不上传飞书
- 视频 >20MB 时用 `ffmpeg -crf 28` 压缩
- 封面是独立图片，**不要拼接到视频上**（视频本身有 intro 页开场）

## 依赖

- Node.js 20+ / npm（`npm install`）
- Playwright（`npx playwright install chromium`）
- FFmpeg + ffprobe（macOS Homebrew 版不带 libass，字幕烧录用 imageio-ffmpeg）
- imageio-ffmpeg（`pip3 install --user imageio-ffmpeg`，提供带 libass 的静态 ffmpeg）
- mmx CLI（`npm install -g mmx-cli`）— TTS
- lark-cli — 抓取飞书文档

## 网络策略

所有网络请求优先直连，直连不通再降级代理。脚本中不要注入 `HTTPS_PROXY`。

## 常见坑

详见 `references/` 目录各文档。关键提醒：

- **mmx TTS 传文本**用 `--text-file`，不要用 `--text`（shell 转义不可靠）
- **ffmpeg subtitles filter 报错**：Homebrew ffmpeg 不带 libass，用 imageio-ffmpeg 的静态 ffmpeg
- **ffmpeg `subtitles` filter 的 `force_style` 引号陷阱**：在 shell 里 `-vf` 中的 `force_style` 逗号会被当 filter 分隔符，各种转义都不稳定。最稳的方式是用 Python `subprocess.run([ffmpeg, ..., "-vf", vf])` 直接传参数（不经 shell）
- **不要 `brew reinstall ffmpeg --build-from-source`**：慢且可能失败，imageio-ffmpeg 即装即用
