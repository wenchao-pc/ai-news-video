#!/usr/bin/env python3
"""
从 news-data.json + 音频时长生成 SRT 字幕文件。

时间轴模型（与 compose-video.ts 一致）：
  - 每段视频时长 = audio_dur + 2s（末尾 1s 停顿 + 1s xfade 区）
  - 视频用 xfade 转场（每次缩短 1s），最终视频总时长 = sum(Ai) + N + 1
  - 音频用 concat + atrim 截断
  - 视频显示节奏：段 0 在 [0, A0+1]，段 i 在 [sum(A0..Ai-1)+i+1, ...]
  - 音频说话节奏：段 i 在 [sum(A0..Ai-1)+2i, sum(A0..Ai-1)+2i+Ai]
  - 字幕应该跟视频画面走而不是跟音频走（音频在 xfade 期间是静音 padding）

用法:
  python3 scripts/generate-srt.py --data output/news-data.json --audio-dir output/run-XXX/audio --out output/run-XXX/subtitles.srt
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def get_audio_duration(audio_path: str) -> float:
    # 优先用系统 ffprobe，fallback 到 ffmpeg -i 解析
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", audio_path],
            text=True
        ).strip()
        return float(out)
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    # fallback: 用 ffmpeg -i 解析 Duration（ffmpeg -i 对无输出文件的输入会返回 1，属正常）
    out = subprocess.run(
        ["ffmpeg", "-i", audio_path],
        text=True, stderr=subprocess.STDOUT, stdout=subprocess.PIPE
    ).stdout
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.\d+)', out)
    if m:
        h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
        return h * 3600 + mi * 60 + s
    return 0.0


def split_sentences(text: str) -> list[str]:
    """按中文标点断句，保留标点。每句 ≤ 25 字。"""
    # 先按句号/问号/感叹号/分号断大句
    raw = re.split(r'(?<=[。！？；])', text.strip())
    sentences = []
    for s in raw:
        s = s.strip()
        if not s:
            continue
        # 如果超 25 字，再按逗号断
        if len(s) > 25:
            sub = re.split(r'(?<=[，,])', s)
            for ss in sub:
                ss = ss.strip()
                if ss:
                    # 合并过短的
                    if sentences and len(sentences[-1]) + len(ss) <= 25:
                        sentences[-1] += ss
                    else:
                        sentences.append(ss)
        else:
            sentences.append(s)
    return sentences


def format_srt_time(seconds: float) -> str:
    """秒 → SRT 时间格式 HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds * 1000) % 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="news-data.json 路径")
    parser.add_argument("--audio-dir", required=True, help="音频目录")
    parser.add_argument("--out", required=True, help="输出 SRT 路径")
    args = parser.parse_args()

    with open(args.data, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 收集所有口播稿和对应音频文件
    entries = []  # [(audio_file, script_text)]
    
    if data.get("intro", {}).get("script"):
        entries.append(("00_intro.mp3", data["intro"]["script"]))
    
    for i, item in enumerate(data.get("items", [])):
        num = f"{i+1:02d}"
        script = item.get("script") or item.get("raw_text") or item.get("subtitle") or ""
        if script:
            entries.append((f"{num}_slide.mp3", script))
    
    if data.get("outro", {}).get("script"):
        entries.append(("99_outro.mp3", data["outro"]["script"]))

    # 计算时间轴（跟视频画面走，不跟音频）
    srt_entries = []  # [(start, end, text)]
    pause_per_segment = 1.0  # 与 compose-video.ts 的 pauseDur 一致
    seg_video_offset = 0.0  # 段 i 视频显示起点

    for seg_idx, (audio_file, script) in enumerate(entries):
        audio_path = os.path.join(args.audio_dir, audio_file)
        if not os.path.exists(audio_path):
            print(f"⚠ 音频不存在，跳过: {audio_path}", file=sys.stderr)
            continue

        dur = get_audio_duration(audio_path)

        # 段 i 视频显示起点 = sum(dur[0..i-1]) + i + 1（前 1s 是段 i-1 的停顿填充画面，
        # 然后是 xfade 1s 重叠，最后才是段 i 的纯显示）
        seg_start = seg_video_offset

        # 断句
        sentences = split_sentences(script)

        # 按字数比例分配时间
        total_chars = sum(len(s) for s in sentences)
        char_cursor = 0.0

        for sent in sentences:
            sent_start = seg_start + (char_cursor / total_chars) * dur
            char_cursor += len(sent)
            sent_end = seg_start + (char_cursor / total_chars) * dur

            # 最后一句话不要超出音频结束
            sent_end = min(sent_end, seg_start + dur)

            # 去掉字幕中的标点符号（更干净的阅读体验）
            clean_sent = re.sub(r'[，。！？；：、\u201c\u201d\u2018\u2019「」（）()\.,;:!?\'"]', '', sent).strip()
            if clean_sent:
                srt_entries.append((sent_start, sent_end, clean_sent))

        # 段 i 视频结束 = seg_start + dur + 1（最后 1s 是 xfade 区，显示段 i+1 的画面）
        seg_video_offset = seg_start + dur + pause_per_segment

    # 写 SRT
    with open(args.out, "w", encoding="utf-8") as f:
        for i, (start, end, text) in enumerate(srt_entries, 1):
            f.write(f"{i}\n")
            f.write(f"{format_srt_time(start)} --> {format_srt_time(end)}\n")
            f.write(f"{text}\n\n")
    
    print(f"✅ SRT 生成完毕 → {args.out}")
    print(f"   字幕条目: {len(srt_entries)} | 总时长: {seg_video_offset:.1f}s")


if __name__ == "__main__":
    main()
