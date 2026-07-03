# mmx voice catalog — Chinese播报 picks

This is the shortlist extracted from `mmx speech voices` output for news-brief-style narration. The full list is huge; these are the ones actually worth trying for tech-briefing voiceover.

## Top picks (tested)

| Voice ID | Vibe | Best for |
|---|---|---|
| `Chinese (Mandarin)_Southern_Young_Man` | 南方青年，温和自然 | **首选** — B站UP主科技日报风格 |
| `Chinese (Mandarin)_Unrestrained_Young_Man` | 洒脱青年，更有活力 | 偏活泼 / 互联网梗向 |
| `Chinese (Mandarin)_Gentle_Youth` | 干净温和、偏书卷气 | 学术 / 严肃科普向 |
| `Chinese (Mandarin)_Warm_Bestie` | 暖闺蜜，亲切活泼 | 偏女性向、生活类资讯 |
| `Chinese (Mandarin)_News_Anchor` | 央视新闻主播风 | 正式 / 政策类资讯 |
| `Chinese (Mandarin)_Male_Announcer` | 沉稳男声 | 纪录片 / 长篇评述 |

## Test procedure

Generate the same short sentence with each candidate voice and compare:

```bash
for voice in "Chinese (Mandarin)_Southern_Young_Man" \
             "Chinese (Mandarin)_Unrestrained_Young_Man" \
             "Chinese (Mandarin)_Gentle_Youth"; do
  mmx speech synthesize \
    --text "大家好，欢迎来到今天的技术情报雷达。今天有个项目在GitHub上直接炸了，一起来看看。" \
    --voice "$voice" \
    --out "/tmp/voice_test/${voice// /_}.mp3"
done
```

The `Chinese (Mandarin)_Southern_Young_Man` voice currently ships as the default pick for B站-style narration in `scripts/generate-audio.ts`.

## Notes

- `--speed` defaults to 1.0; if narration feels slow for tech-paced content, try `--speed 1.05` or `--speed 1.1`.
- 10k char cap per `synthesize` call — break long voiceovers into multiple calls and stitch with `ffmpeg` `concat` if needed.
- `--subtitles` returns timing data (word-level) — useful if you also want SRT subtitles burned into the video later.