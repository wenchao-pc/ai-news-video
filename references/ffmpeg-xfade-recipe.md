# FFmpeg xfade recipes for slide-deck video composition

The `xfade` filter blends two video streams with a transition. `acrossfade` does the same for audio. The math that always trips people up: **the offset of each xfade must equal the previous clip's duration minus the transition duration**. Get this wrong and you get a black flash or a clipped tail.

## ⚠ Critical: pause-then-transition pattern + audio sync

Each segment is padded with a freeze-frame + silence tail, then xfade is placed at the very end of that tail. This gives: audio finishes → freeze + silence for N seconds → visual transition → next slide.

**CRITICAL — audio sync**: `acrossfade` duration MUST equal `xfade` duration (`td`). If you use `acrossfade=d=0.01` while `xfade=duration=1.0`, the video timeline shrinks by 1.0s per transition but the audio timeline shrinks by only 0.01s. Over 20+ transitions this accumulates into ~20s of drift — video runs far ahead of audio. Always use `acrossfade=d=${td}`.

Because each segment is padded with silence at the end, `acrossfade=d=td` crossfades **silence→next_slide_audio** — there is no audible voiceover bleed.

```bash
# Step 1: Pad each segment (pause=1s, transition=1s → pad=2s)
ffmpeg -y -i seg.mp4 \
  -vf "tpad=stop_mode=clone:stop_duration=2.0" \
  -af "apad=pad_dur=2.0" \
  -c:v libx264 -pix_fmt yuv420p -r 30 -crf 23 -preset fast \
  -c:a aac -b:a 128k -shortest padded.mp4

# Step 2: xfade with offset = padded_duration - td (transition happens in last td seconds)
# Audio MUST use acrossfade=d=td (NOT d=0.01 — that causes cumulative desync)
```

In the filter_complex chain:
```
offset = cumulative_padded_duration - td
# This places the visual transition AFTER the pause, not during it
```

Default values: `pause=1.0s`, `td=1.0s` (total pad per segment = 2.0s).

## Basic 2-slide example (legacy, no pause)

```bash
ffmpeg \
  -i slide_01.mp4 \
  -i slide_02.mp4 \
  -filter_complex "
    [0:v][1:v]xfade=transition=slideleft:duration=1.0:offset=25.0,
    [0:a][1:a]acrossfade=d=1.0
  " \
  -c:v libx264 -c:a aac -pix_fmt yuv420p \
  output.mp4
```

## N-slide programmatic pattern

Chaining xfade by hand for ≥3 slides is error-prone. The recipe is to keep a running accumulator:

```ts
// After padding each segment with (pause + td) seconds:
let cumulativeDur = paddedSegs[0].duration;

for (let i = 1; i < paddedSegs.length; i++) {
  const offset = Math.max(0, cumulativeDur - td);
  const trans = transitionList[i - 1] || "fade";
  
  filter += `${prevVideo}[${i}:v]xfade=transition=${trans}:duration=${td}:offset=${offset}[vOut];`;
  // ⚠ acrossfade d MUST equal td — mismatch causes cumulative audio-video desync
  filter += `${prevAudio}[${i}:a]acrossfade=d=${td}:c1=tri:c2=tri[aOut];`;
  
  cumulativeDur += paddedSegs[i].duration - td;
}
```

`durations` comes from probing each `slide_NN.mp4` with `ffprobe -v error -show_entries format=duration` before composing.

## Per-slide production

Each slide is its own short video first — image as a still frame, audio overlaid, length = audio length:

```bash
ffmpeg -loop 1 -i slide_01.png -i slide_01.mp3 \
  -c:v libx264 -tune stillimage -c:a aac \
  -pix_fmt yuv420p -shortest slide_01.mp4
```

`-shortest` ensures the video stops when audio finishes.

## Available xfade transitions

fade, slideleft, slideright, slideup, slidedown, wipeleft, wiperight, wipeup, wipedown, circleopen, circleclose, zoomin, dissolve, horzopen, vertopen, radialwipe, smoothleft

## Pitfalls

- **Audio-video desync** → `acrossfade` duration MUST equal `xfade` duration. Using `d=0.01` with `xfade=duration=1.0` causes ~1s drift per transition, accumulating to ~20s over a 20-slide video. The silence padding prevents voiceover bleed, so `d=td` is always safe.
- **Wrong offset** → black frames or missing transitions. Recheck `prev_duration - transition_dur`.
- **`-shortest` on the per-slide step** is essential, otherwise the still-image loop runs forever.
- **Don't use `libx264` preset `ultrafast`** — the file balloons. `-preset fast -crf 28` is the sweet spot for 1080p news brief content.
- **`-pix_fmt yuv420p`** is required for QuickTime / iOS playback. FFmpeg's default may be `yuv444p` on some builds.
- **Feishu 20MB upload limit** → compress with `ffmpeg -crf 28 -preset fast -c:a aac -b:a 96k` before uploading.
