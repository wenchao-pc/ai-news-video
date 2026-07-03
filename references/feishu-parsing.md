# 飞书日报文档解析

## 文档 HTML 结构

飞书日报（lark-cli docs +fetch）返回 HTML 格式，结构如下：

```html
<title>📡 2026-07-01 · 开源与模型</title>

<h2>🐙 GitHub 热门 AI 项目</h2>

<h3>项目名：副标题</h3>
<p>项目描述段落...</p>
<callout emoji="💡"><p>编辑评论/分析...</p></callout>
<p>⭐ 5846 stars | 🍴 475 forks | Python</p>
<p><a href="https://github.com/xxx">链接</a></p>
<hr/>

<h3>下一个项目...</h3>
...
```

## 解析要点

1. **分类**：从 `<title>` 提取，格式 `📡 日期 · 分类名`
2. **条目分割**：按 `<hr/>` 分割，每个 section 是一条资讯
3. **项目名**：`<h3>` 标签，冒号前是简洁名称
4. **描述**：第一个 `<p>`（排除 ⭐ 开头的指标行和 https 开头的链接行）
5. **评论**：`<callout>` 内的 `<p>`，通常是大段分析
6. **指标**：⭐ stars | 🍴 forks | 语言，用正则提取
7. **链接**：`<a href=...>`，注意处理转义引号 `\"`
8. **raw_text**：描述 + 评论拼接，供 Agent 改写口播稿

## 分类映射

| 标题关键词 | 映射 |
|-----------|------|
| 开源/模型 | 🔧 开源与模型 |
| 社区/热议 | 💬 社区热议 |
| 产品/商业 | 💰 产品与商业 |

## 合并策略

同类条目可合并以减少视频长度：
- Ornith-1.0 有 GGUF版/9B GGUF版/9B基础版 → 合并为一条
- Qwythos-9B 有 GGUF版和原始版 → 合并为一条
- 合并后 raw_text 取主版本描述，title 加"系列"后缀

## lark-cli 命令

```bash
# 抓取文档（直连，不走代理）
lark-cli docs +fetch --doc "TOKEN"

# 上传文件（需相对路径，单文件 < 20MB）
cd /path/to/dir && lark-cli drive +upload --file ./file.mp4 --name "名称"
```
