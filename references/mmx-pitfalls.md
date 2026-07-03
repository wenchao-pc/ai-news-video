# mmx CLI (MiniMax) 踩坑记录

## 1. 不要用 mmx 调 LLM 生成口播稿

**问题**：MiniMax-M2.7 和 M2.7-highspeed 都是推理模型（有 thinking 块）。`--max-tokens` 设置太小时，所有 token 都被 reasoning 消耗，`--output text` 返回空字符串。

**实测**：
- `--max-tokens 20` + `--output text` → 空输出（全被 thinking 吃掉）
- `--max-tokens 300` → 口播稿被截断（thinking 占了大部分）
- `--max-tokens 2000` → 偶尔成功但极度浪费且不稳定

**结论**：口播稿由 Agent（当前模型）直接生成，写入 JSON 的 `script` 字段。mmx 只用于 TTS。

## 2. mmx 网络连接

mmx 直连 api.minimaxi.com 国内可达，**不需要代理**。如果之前设了代理导致不稳定：

```bash
# 编辑 ~/.mmx/config.json，把 proxy 改为 null
# { "api_key": "...", "region": "cn", "proxy": null }
```

脚本中不要注入 `HTTPS_PROXY` 等环境变量，让 mmx 走直连。

## 3. TTS 文本传递方式

| 方式 | 可靠性 | 说明 |
|------|--------|------|
| `--text '中文内容'` (execSync shell) | ❌ 不可靠 | shell 转义截断多行文本 |
| `--text` (execFileSync args) | ⚠️ 偶发 | 长文本可能被截断 |
| `--text-file -` (stdin) | ❌ macOS 报 EACCES | /dev/stdin 权限问题 |
| `--text-file /tmp/xxx.txt` (临时文件) | ✅ 稳定 | **推荐方式** |

**正确做法**：写临时文件，用 `--text-file` 传递：
```typescript
fs.writeFileSync(tmpFile, text);
execFileSync("mmx", ["speech", "synthesize", "--text-file", tmpFile, "--voice", voice, ...]);
fs.unlinkSync(tmpFile);
```

## 4. mmx text chat 输出捕获（如果必须用 LLM）

⚠️ **首选方案是不要用 mmx 调 LLM**（见第1条）。但如果必须用：

- `--messages-file <path>` 传 JSON 数组消息文件是最可靠方式：
  ```json
  [{"role":"system","content":"..."},{"role":"user","content":"..."}]
  ```
- **不带 `--quiet` + `--output text`**：execFileSync 可捕获 stdout（可能有前导空行，trim 处理）
- **带 `--quiet` + `--output text`**：stdout 被完全吞掉，返回空——**不要加 --quiet**
- **用 shell 重定向 `> file 2>/dev/null`**：不可靠，spinner 残留可能混入文件
- **`--system "$(cat file)"` shell 展开**：多行中文文本会被截断到第一行

**结论**：用 `execFileSync` + `--messages-file` + `--output text`，不加 `--quiet`。

## 5. TTS 限速 (RPM)

批量生成 20+ 条音频时会触发 `rate limit exceeded(RPM)`。

**应对**：脚本内置重试逻辑（3 次，递增等待 3/6/9 秒）。30 条视频生成约需 5-6 分钟。

## 6. 可用音色参考

默认音色：`Chinese (Mandarin)_Southern_Young_Man`（南方青年，B站UP主风格）

其他候选见 `mmx speech voices` 命令。试听：生成同一句话的不同音色 MP3 对比。
