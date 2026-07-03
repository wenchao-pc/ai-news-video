---
name: ai-news-video
description: 从飞书文档或 JSON 数据生成 PPT 风格视频：HTML 渲染 PPT 页面 → MiniMax TTS 口播音频 → FFmpeg 转场合成 MP4。
version: 0.5.1
tags: [video, tts, ffmpeg, ppt, automation]
---
# AI News Video — PPT 视频生成流水线

从资讯数据生成带口播配音和转场效果的 PPT 风格视频。详细文档见 `README.md`。

> **0.5.1 变更**：① 硬字幕方案更新——用 imageio-ffmpeg 静态 ffmpeg（自带 libass）替代慢速 brew reinstall；② ffmpeg subtitles filter 引号陷阱记录。
>
> **0.5.0 变更**：① TTS 默认音量改为 `--volume 5.0`（之前是 mmx 默认 1.0，mean ≈ -26 dB 偏小）；② 新增 `scripts/generate-srt.py` 字幕生成（见「字幕」节）。

## 快速使用

```bash
cd ~/.hermes/skills/ai-news-video

# 完整流程：飞书文档 → 视频
npx tsx scripts/fetch-feishu.ts --url "https://xxx.feishu.cn/docx/TOKEN" --max-items 30
# ⚠ Agent 读取 output/news-data.json，为每条 raw_text 生成 script 和 transitions
npx tsx scripts/make-video.ts --data output/news-data.json

# 用 mock 数据快速测试
npx tsx scripts/make-video.ts

# 只重新生成视频（复用已有 PPT 和音频）
npx tsx scripts/make-video.ts --skip-ppt --skip-audio
```

## 架构

```
飞书文档 → fetch-feishu.ts → news-data.json (raw_text, 无 script)
                                      ↓
                          Agent 生成 script + transitions
                                      ↓
           ┌──────────────────────────┴──────────────────────────┐
     generate-ppt.ts                                    generate-audio.ts
  数据→HTML→PNG(含封面)                           JSON script→mmx TTS→MP3
           └──────────────────────────┬──────────────────────────┘
                                   compose-video.ts
                              PNG+MP3→FFmpeg xfade→MP4
                                      ↓
                             organize-output.ts + 上传飞书
```

### 核心脚本

| 脚本 | 功能 |
|------|------|
| `fetch-feishu.ts` | ★ 飞书文档→JSON（提取 raw_text，不含 script） |
| `make-video.ts` | ★ 一键入口（编排 PPT→音频→视频 3 步） |
| `generate-ppt.ts` | 数据→HTML→PNG（含片头/内容/片尾/封面） |
| `generate-audio.ts` | 从 JSON 读口播稿→mmx TTS→MP3 |
| `compose-video.ts` | PNG+MP3→FFmpeg→MP4（xfade 多转场） |
| `generate-srt.py` | 从 JSON 口播稿+音频时长→SRT 字幕（见「字幕」节） |
| `organize-output.ts` | 整理输出目录结构 |
| `preview-templates.ts` | 预览所有模板效果 |

### 完整工作流（Agent 执行步骤）

1. **抓取飞书文档**：`npx tsx scripts/fetch-feishu.ts --url "URL" --max-items 30`
2. **生成口播稿**：Agent 读取 `output/news-data.json`，为每条 `raw_text` 生成口语化 `script` 字段（80-150字），生成 `intro.script`、`outro.script`、`transitions[]`，写回 JSON
3. **一键生成视频**：`npx tsx scripts/make-video.ts --data output/news-data.json`
4. **整理+打包+上传**：`npx tsx scripts/organize-output.ts`，压缩视频（飞书限制 20MB），上传

## 口播稿和转场（Agent 直接生成，不用 mmx LLM）

⚠️ **不要用 mmx CLI 调 LLM 生成口播稿**。MiniMax-M2.7 是推理模型，会消耗大量 token 在 thinking 上，导致输出被截断或为空。由当前 Agent 直接读取原文、改写为口语化文案写入 JSON。

### 口播稿要求
- B站UP主风格，口语化，生动有节奏
- 80-150字/条（约 15-30 秒口播）
- 开头用不同钩子词（"来看看这个""这个项目有意思"等），不要用"第N条"
- **品牌名：默认用 "AI 开源速递"**（片头/片尾/封面 label/最后一条收尾都统一）
- **主题定位：AI 开源项目与开源模型的介绍**（不要说"开源 AI"等相近但不同的措辞）
- 片头示例："欢迎来到 AI 开源速递。今天我们介绍 N 个精选的 AI 开源项目和开源模型，覆盖 Agent 框架、新模型和开发者工具三个方向。"
- 片尾示例："今天的 AI 开源速递就到这里。"

> 不要用"技术情报雷达""每日资讯"等品牌词 —— 用户明确否定了这些旧名称。

### 转场选择
根据相邻内容语义选择，同类用平滑转场（fade/dissolve/smoothleft），跨类别或重磅消息用冲击转场（zoomin/circleopen/wipeleft）。

## 音频响度（必读）

mmx TTS 默认输出 mean ≈ -25 dB / peak ≈ -7 dB，**明显偏小**，用户第一次看视频会嫌声音轻。要在生成阶段就把它调响，不要靠 ffmpeg 后处理硬撑。

**首选：调 mmx 的 `--volume` 参数**（1.0–5.0 范围），参考实测值：

| `--volume` | mean | max | 听感 |
|---|---|---|---|
| 1.0（mmx 默认）| -25.8 dB | -8.9 dB | 偏小（手机外放听不清）|
| 3.0 | -16.0 dB | -1.0 dB | 够用但略保守 |
| 5.0 | -12.1 dB | -0.2 dB | **当前默认 —— 用户确认够响** |

`generate-audio.ts` 已支持 `--volume`（CLI 透传到 mmx），`make-video.ts` 已支持 `--volume`（透传到 generate-audio）。**默认 5.0**，跑出来就是用户认可的响度。如果某次跑出来还嫌小，**不要用 ffmpeg 后处理**（见下方坑），先确认 TTS 阶段就传了 `--volume 5.0`。

**备选：ffmpeg 后处理**（如果脚本暂时改不了），见 `references/audio-loudness.md`。关键坑：

- **loudnorm 之后的 volume 几乎无效**：loudnorm 会把均值拉回到目标 LUFS 附近，再叠 volume 只会被后面的 limiter 拉回，体感响度没增加。
- **heavy compression 才能提响度**：用 `acompressor threshold=-12dB ratio=20 makeup=18dB` 先把动态压扁，再 `volume=1.5`，最后 `alimiter limit=0.95` 只防真爆。
- **实测天花板**：TTS 峰值在 -7 dBFS 附近，理论上 mean 最高能到 -10 dB，再大就爆音。

**拼接时不要用 concat demuxer**（`-c copy`）：混合流的时间基/PTS 不同会触发 `Conversion failed!` 或者时间戳乱跳（5 分钟视频变 8 分钟）。用 `filter_complex` 显式 `setpts=PTS-STARTPTS` / `asetpts=PTS-STARTPTS` 串接。

## 模板

模板可插拔，位于 `templates/` 目录，用 `{{变量名}}` 占位：

| 模板 | 风格 |
|------|------|
| `terminal` | 终端风（黑底+霓虹绿）← 默认 |
| `hud` | HUD 仪表盘风（蓝黑+青色+紫红） |
| `minimal` | 极简卡片风（纯黑+单色高亮） |

每个模板目录含：`slide.html`（内容页）、`intro.html`（片头）、`outro.html`（片尾）、`cover.html`（封面）、`config.json`。

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
      "subtitle": "一句话简介",
      "metrics": { "stars": "5846" },
      "highlights": ["亮点1", "亮点2", "亮点3"],
      "link": "github.com/...",
      "source_label": "GitHub Trending",
      "raw_text": "资讯原文（fetch-feishu 提取）",
      "script": "口播文案（Agent 生成）"
    }
  ]
}
```

## 依赖

- Node.js 20+ / npm（`npm install` 安装依赖）
- Playwright（`npx playwright install chromium`）
- FFmpeg + ffprobe
- mmx CLI（`npm install -g mmx-cli`）— 仅用于 TTS
- lark-cli — 用于抓取飞书文档和上传

## 模板设计规范（terminal 模板）

用户在本 skill 上反复调了多轮字号/排版，以下是验证过的参数，**不要随意改动**：

### 字号
| 元素 | 字号 | 说明 |
|------|------|------|
| header（日期/分类） | 36px | flex space-between，左右两端 |
| cmd（命令行装饰） | 32px | |
| title（大标题） | 110px | |
| subtitle（副标题） | 44px | |
| metrics（指标标签） | 32px | flex 排列 |
| highlights（亮点列表） | 40px | |
| footer（链接） | 36px | |

### 文本溢出规则
- **大标题**：单行 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`
- **副标题**：最多 2 行 `-webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden`
- **highlights 每条**：单行 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`（加在 `li` 上）

### 间距（防止 highlights 与 footer 重叠）
- header `margin-bottom: 50px`
- subtitle `margin-bottom: 45px`
- metrics `margin-bottom: 50px`
- highlights `line-height: 1.5`

### Footer 设计
- **只放链接**，不放分类（分类已在 header 右侧显示）
- icon 用 🔗，左对齐（`display: block`，不是 flex）
- 超长链接也要 `text-overflow: ellipsis`

### Header 设计
- 左：`▶ {{date}}`
- 右：`{{category}}`（分类后面**不要**加横线装饰 `━━━━━━`）

### 迭代流程
每次调整字号/间距后，用超长测试数据生成一张 slide 截图给用户确认，再批量生成。不要用短数据测试（看不出溢出效果）。

## 数据字段约束

- `metrics`：每条**至少 3 个** key-value 对（不足则从 raw_text 补充 stars/forks/language/downloads/likes 等）
- `highlights`：**正好 3 条**，不能多不能少，每条 15-30 字
- `transitions`：效果要**多样化**，不要全是 fade。同类内容用 dissolve/smoothleft/slideleft，跨类别或重磅消息用 circleopen/zoomin/wipeleft
- `transitions` 格式兼容字符串数组 `["fade", ...]` 和对象数组 `[{transition: "fade"}, ...]`

## 网络策略

- **所有网络请求优先直连**，直连不通再判断是否被墙
- mmx CLI 已移除代理配置（`~/.mmx/config.json` proxy=null），直连 api.minimaxi.com 正常
- 脚本中不要注入 `HTTPS_PROXY` 环境变量

- 默认时长：**1.0 秒**（PPT 经典节奏）
- **停顿后再转场**：每段音频播完后先冻结画面+静音 1 秒，再开始视觉转场。详见 `references/ffmpeg-xfade-recipe.md` 的 pause-then-transition 模式。
- **音画同步**：`acrossfade` 的 `d` 必须等于 `xfade` 的 `duration`（即 `td`）。如果音频用 `d=0.01` 而视频用 `duration=1.0`，每次转场视频比音频少 ~1s，20+ 次累积偏移达 ~20s。因为每段尾部有静音 padding，`d=td` 交叉淡化的是「静音→下一段音频」，不会有声音重叠。
- 可用效果：fade, slideleft, slideright, slideup, slidedown, wipeleft, wiperight, wipeup, wipedown, circleopen, circleclose, zoomin, dissolve, horzopen, vertopen, radialwipe, smoothleft
- `--transition-dur 1.5` 可自定义

## 输出目录结构

每次运行 `make-video.ts` 默认生成**独立的时间戳目录**，保留所有中间产物，多次运行互不覆盖：

```
output/
└── run-20260703-104001/         ← 每次运行一个独立目录（YYYYMMDD-HHmmss）
    ├── slides/                  ← PPT 页面 PNG + manifest.json
    │   ├── 00_intro.png
    │   ├── 01_xxx.png
    │   ├── 99_outro.png
    │   └── manifest.json
    ├── audio/                   ← MP3 音频（每页一段）
    │   ├── 00_intro.mp3
    │   ├── 01_xxx.mp3
    │   └── 99_outro.mp3
    └── final.mp4                ← 最终视频
```

**自定义输出**：用 `--out <path>` 指定完整输出文件路径（仍会写一份中间文件到独立目录，最终视频另存到指定路径）：

```bash
npx tsx scripts/make-video.ts --out /tmp/my-video.mp4
```

**复用历史中间产物**：从某次运行的目录恢复，跳过对应步骤：

```bash
npx tsx scripts/make-video.ts \
  --data output/run-20260701-080000/news-data.json \
  --skip-ppt --skip-audio
```

**清理**：可直接删除任意 `output/run-*/` 目录；历史数据 JSON 在 `output/data/`。

## 输出与交付

**每次任务的标准输出格式**（4 项，缺一不可）：
1. **标题**：`AI开源速递-YYYY.MM.DD`（从数据 date 字段提取）
2. **简介**：200 字以内，概括本期项目和模型亮点，按 Agent/模型/工具等方向分类
3. **封面图**：MEDIA: cover.png
4. **视频**：MEDIA: final-sub.mp4（带硬字幕版）

- **默认不发飞书**：用户偏好结果直接发给他（在聊天中发 MEDIA: 文件），不需要上传到飞书云空间。
- 如果视频 >20MB（飞书单文件限制），用 `ffmpeg -crf 28 -preset fast -c:a aac -b:a 96k` 压缩后再发。
- `lark-cli drive +upload` 仅在用户明确要求上传时使用，需用**相对路径**（cd 到文件目录再执行）。
- **字幕烧录**：默认输出带硬字幕版（final-sub.mp4），用 imageio-ffmpeg 自带的静态 ffmpeg（带 libass）。字幕无标点（更干净的阅读体验）。
- **品牌名**：统一用「AI开源速递」，不要用「技术情报雷达」或「今日资讯」等旧名称。
- **封面是独立图片，不要拼接到视频上**。视频本身已经有 intro 页面作为开场。`generate-ppt.ts` 会输出 `output/cover.png`（或 `output/<run-dir>/slides/_cover.png`，取决于脚本），单独发 MEDIA 即可。如果用 ffmpeg 拼了 cover 段到视频前面，必须撤销。

## 模板 CSS 调试

迭代修改 CSS 时必须注意：
- **patch 嵌套 bug**：反复 patch 同一个 CSS 选择器可能导致选择器重复嵌套，使整条规则静默失效。每次 patch 后 `grep -c "\.subtitle {" templates/terminal/slide.html` 确认只有 1 个。
- **`-webkit-line-clamp`** 不要和 `max-height`、`text-overflow: ellipsis`、`white-space: nowrap` 混用——会破坏多行截断。
- **测试溢出必须用长文本**（200+字符），短文本看不出问题。用 Playwright 检查 `scrollHeight` 确认 CSS 生效。
- **⚠ 数据层 vs CSS 层双重截断**：不要在 `fetch-feishu.ts` 里把 subtitle 硬截断成 `57字 + "..."`，否则 60 字内容在 44px 字体下只占 ~1.5 行，却因为文本本身含 `"..."` 而看起来"没满 2 行就溢出了"。正确做法：数据层传足文字（≤120字），让 CSS `-webkit-line-clamp` 自然在第 2 行末尾截断加省略号。如果已有 JSON 数据被截断过，用 `raw_text[:120]` 重新生成 subtitle 再重跑。

详见 `references/template-css-pitfalls.md`、`references/audio-loudness.md`。

## 字幕

从口播稿生成 SRT 字幕，无需 ASR——JSON 里的 `script` 字段就是字幕原文，按音频时长对齐时间轴即可。

### 生成 SRT

```bash
python3 scripts/generate-srt.py \
  --data output/news-data.json \
  --audio-dir output/run-XXX/audio \
  --out output/run-XXX/subtitles.srt
```

时间轴模型与 `compose-video.ts` 一致：每段音频播放后停顿 1s（`pauseDur`），下一段在 `seg_end + 1s` 处开始。断句按中文标点（。！？；，），每句 ≤25 字，按字数比例分配显示时长。

### 嵌入字幕到视频

⚠️ **Homebrew 的 ffmpeg 8.1 默认不带 `--enable-libass`**，所以 `subtitles` 和 `ass` filter **不可用**（报 `No option name near ...` 或 `Error parsing filterchain`）。不要浪费时间尝试 `force_style` 转义——问题在 ffmpeg 编译选项不在引号。

**可用方案：软字幕（mov_text）**——不重编码视频，秒级完成，但需要播放器支持字幕显示：

```bash
ffmpeg -y -i final.mp4 -i subtitles.srt \
  -c copy -c:s mov_text \
  final-softsub.mp4
```

**硬字幕（烧入画面）**：需要带 libass 的 ffmpeg。Homebrew ffmpeg 8.1 默认不带 libass，**最快的解决方案是用 imageio-ffmpeg 提供的静态 ffmpeg 二进制**（自带 libass + freetype + fontconfig）：

```bash
# 安装（秒级）
pip3 install --user imageio-ffmpeg

# 获取路径
python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
# → ~/Library/Python/3.x/lib/python/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1

# 烧录硬字幕（force_style 里的逗号不需要转义，用 Python subprocess 调用最稳）
python3 << 'EOF'
import subprocess
FFMPEG = "<imageio_ffmpeg_path>"  # 替换为上面输出的路径
vf = "subtitles=subs.srt:force_style='FontName=PingFang SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,MarginV=55'"
subprocess.run([FFMPEG, "-y", "-i", "final.mp4", "-vf", vf,
    "-c:v", "libx264", "-preset", "fast", "-crf", "28", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "final-sub.mp4"])
EOF
```

如果 Homebrew ffmpeg 被卸载或不可用，可以软链 imageio-ffmpeg 的 ffmpeg 到 `/opt/homebrew/bin/ffmpeg`：
```bash
ln -sf "$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')" /opt/homebrew/bin/ffmpeg
```

⚠️ **不要用 `brew reinstall ffmpeg --build-from-source`**：编译耗时长（5-10 分钟），且可能因为锁文件残留失败。imageio-ffmpeg 是即装即用的替代方案。

## 常见问题

详见 `references/mmx-pitfalls.md`。

- **mmx TTS 限速**：大量条目时会触发 RPM 限制，脚本已有重试逻辑（3次，递增等待）
- **mmx TTS 传文本**：用 `--text-file <path>` 写临时文件传递，不要用 `--text`（shell 转义不可靠）
- **TS 类型错误**：tsconfig.json 已配置，tsx 运行时忽略类型错误直接执行
- **字体不加载**：确保能访问 Google Fonts，或换本地字体
- **ffmpeg `subtitles` filter 报 `Error parsing filterchain`**：Homebrew ffmpeg 8.1 不带 libass，见「字幕」节用 imageio-ffmpeg。另外 `force_style` 参数里的逗号在 shell 中会被当 filter 分隔符——用 Python subprocess 直接传参数最稳，不要在 shell 命令里拼 `-vf` 字符串
- **`brew reinstall ffmpeg` 把 ffmpeg 卸了但没装回来**：如果 reinstall 被 timeout/kill 中断，ffmpeg 二进制会丢失。用 `pip3 install --user imageio-ffmpeg` 立即恢复，然后软链到 `/opt/homebrew/bin/ffmpeg`
