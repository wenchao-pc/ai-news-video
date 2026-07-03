# FFmpeg 转场效果速查表 (xfade)

## 基本语法

```
[0:v][1:v]xfade=transition=TYPE:duration=D:offset=O[v01]
```

- `transition`: 效果类型
- `duration`: 转场时长（秒）
- `offset`: 开始转场的时间点 = 上一段总时长 - duration

## 常用转场

| 效果 | 参数 | 描述 |
|------|------|------|
| fade | `fade` | 渐隐渐显 |
| dissolve | `dissolve` | 溶解 |
| wipeleft | `wipeleft` | 向左擦除 |
| wiperight | `wiperight` | 向右擦除 |
| slideleft | `slideleft` | 向左滑动 |
| slideright | `slideright` | 向右滑动 |
| slideup | `slideup` | 向上滑动 |
| slidedown | `slidedown` | 向下滑动 |
| circleopen | `circleopen` | 圆形展开 |
| circleclose | `circleclose` | 圆形收缩 |
| radialwipe | `radialwipe` | 径向擦除 |
| zoomin | `zoomin` | 放大 |
| smoothleft | `smoothleft` | 平滑左滑 |
| horzopen | `horzopen` | 水平展开 |
| vertopen | `vertopen` | 垂直展开 |

## 音频交叉淡入淡出

```
[0:a][1:a]acrossfade=d=0.5[a01]
```

## 多段拼接模板

```
# 3段拼接
[0:v][1:v]xfade=transition=fade:duration=0.5:offset=14.5[v01];
[0:a][1:a]acrossfade=d=0.5[a01];
[v01][2:v]xfade=transition=slideleft:duration=0.5:offset=29.5[vout];
[a01][2:a]acrossfade=d=0.5[aout]
```

## 图片+音频 → 视频

```bash
ffmpeg -loop 1 -i image.png -i audio.mp3 \
  -c:v libx264 -tune stillimage -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 128k -shortest output.mp4
```

## 获取音频时长

```bash
ffprobe -v quiet -show_entries format=duration -of csv=p=0 audio.mp3
```
