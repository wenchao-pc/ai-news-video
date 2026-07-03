# 音频响度与拼接（ffmpeg 后处理）

本文档收集让 AI 开源速递视频音视频「够响、够稳、不爆音」的所有技巧。首选是在 `generate-audio.ts` 里给 mmx 传 `--volume=5.0`（详见 SKILL.md「音频响度」节）。本文是脚本暂时改不了时的备选方案。

## 1. 测量当前响度

```bash
ffmpeg -i input.mp4 -af volumedetect -vn -f null - 2>&1 | grep -E "mean_volume|max_volume"
```

- `mean_volume` ≈ -25 dB 是 TTS 默认输出，明显偏小
- `max_volume` 决定 headroom；超过 -1 dB 就会削波

## 2. 推荐的响度处理链路

```bash
# 顺序：heavy compression → 整体音量 → 真峰值兜底
ffmpeg -y -i input.mp4 \
  -af "acompressor=threshold=-12dB:ratio=20:attack=5:release=80:makeup=18dB,volume=1.5,alimiter=limit=0.95:level_in=1.0:level_out=1.0:attack=10:release=100" \
  -c:v copy -c:a aac -b:a 192k output.mp4
```

为什么这样配：

| filter | 作用 | 关键参数 |
|---|---|---|
| `acompressor` | 把动态范围从 ~20 dB 压到 ~6 dB，让弱音段也响 | `ratio=20`（接近 hard limiter）；`makeup` 自动补回增益 |
| `volume` | 整体抬一点 | `1.5`（+3.5 dB）就够 |
| `alimiter` | 只防真爆音（>0.95）| `attack=10` 不抓太紧，否则语音每 30-50ms 一次的能量峰会被压平 |

**为什么 loudnorm 不行**：loudnorm 会把均值拉回到目标 LUFS，后续的 volume 和 limiter 都是在 loudnorm 的输出上工作，体感响度几乎不增加。如果必须用 loudnorm，先用 `I=-8` 激进目标，再叠 compressor。

## 3. 拼接两段视频的稳妥方法

**坑**：用 `concat demuxer`（`ffmpeg -f concat -i list.txt -c copy`）拼两段不同源的视频（比如 cover 段 + 主视频），经常会触发：

- `Conversion failed!`（流的 timebase 不一致）
- 时间戳乱跳（5 分钟视频变成 8 分钟）
- 音画错位

**正确做法**：`filter_complex` 显式重置时间戳：

```bash
# 拼接 cover（4 秒静音循环图）+ 主视频
ffmpeg -y \
  -loop 1 -t 4 -i cover.png \
  -i main.mp4 \
  -filter_complex "[0:v]fps=24,scale=1920:1080,setpts=PTS-STARTPTS[v0];[1:v]setpts=PTS-STARTPTS[v1];[1:a]asetpts=PTS-STARTPTS[a1];anullsrc=r=24000:cl=mono:d=4[s0];[s0][a1]concat=n=2:v=0:a=1[ac];[v0][v1]concat=n=2:v=1:a=0[vc]" \
  -map "[vc]" -map "[ac]" \
  -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 96k -ar 24000 -ac 1 \
  final.mp4
```

要点：
- 每段都 `setpts=PTS-STARTPTS`（视频）/ `asetpts=PTS-STARTPTS`（音频）—— 这是修时间戳乱跳的关键
- cover 段没有音轨，所以 `[1:a]` 之前先生成 4 秒静音 `anullsrc` 占位
- 视频/音频分别 `[v0][v1]concat=n=2:v=1:a=0` 和 `[s0][a1]concat=n=2:v=0:a=1`，最后 `-map` 各自的输出

## 4. 试听对比样本

调 `--volume` 时建议先生成 5 个对比样本（1.0 / 1.5 / 2.0 / 3.0 / 5.0）拼成一段带「嘟」提示音的对比音频，让用户挑一个。

```bash
# 把 5 个样本拼成对比音频
ffmpeg -y \
  -f lavfi -i "sine=frequency=880:duration=0.3:sample_rate=32000" \
  -i vol-1.0.mp3 -i vol-1.5.mp3 -i vol-2.0.mp3 -i vol-3.0.mp3 -i vol-5.0.mp3 \
  -filter_complex "[0:a]volume=0.3,asplit=5[b1][b2][b3][b4][b5];[1:a][b1][2:a][b2][3:a][b3][4:a][b4][5:a][b5]concat=n=10:v=0:a=1[out]" \
  -map "[out]" -c:a libmp3lame -b:a 192k -ar 32000 -ac 1 compare.mp3
```

## 5. 不要做的事

- ❌ 不要在生成时设 `volume=10.0` 或更大 —— TTS 峰值在 -7 dBFS，超过 5.0 几乎一定会爆
- ❌ 不要用 `dynaudnorm` 单独提响度 —— 它只拉动态不抬均值，结果是「声音更紧但还是不大声」
- ❌ 不要在 `generate-audio.ts` 里用 `--text` 传文本 —— shell 转义不可靠，用 `--text-file`
- ❌ 不要把响度处理塞进 `compose-video.ts` —— 它已经够复杂；处理放在 `make-video.ts` 之后独立跑 ffmpeg，更易调试
