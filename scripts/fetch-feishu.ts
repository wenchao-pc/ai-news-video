/**
 * fetch-feishu.ts — 从飞书文档链接抓取内容，解析为视频数据 JSON
 *
 * 用法:
 *   npx tsx scripts/fetch-feishu.ts --url "https://hcnq7248hv5i.feishu.cn/docx/XXXXXX"
 *   npx tsx scripts/fetch-feishu.ts --url "https://..." --max-items 8 --out output/news-data.json
 *
 * 输出: 结构化 JSON（含 items 但不含 script 字段，需 Agent 补充）
 */

import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── CLI ──
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string, d?: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : d;
  };
  return {
    url: get("url", ""),
    out: get("out"),  // 不给默认值，undefined 时自动创建 run 目录
    maxItems: parseInt(get("max-items", "8")),
  };
}

// ── 从 URL 提取 doc token ──
function extractDocToken(url: string): string {
  // 匹配 /docx/ 或 /docs/ 后的 token
  const match = url.match(/\/(?:docx|docs)\/([A-Za-z0-9]+)/);
  if (match) return match[1];
  throw new Error(`无法从 URL 提取文档 token: ${url}`);
}

// ── 调用 lark-cli 抓取文档 ──
function fetchFeishuDoc(token: string): string {
  const result = execSync(`lark-cli docs +fetch --doc "${token}"`, {
    encoding: "utf-8",
    timeout: 30000,
  });
  const data = JSON.parse(result);
  if (!data.ok) throw new Error(`飞书文档抓取失败: ${JSON.stringify(data)}`);
  return data.data.document.content;
}

// ── 从 HTML 解析资讯条目 ──
interface NewsItem {
  category: string;
  title: string;
  subtitle: string;
  metrics: Record<string, string>;
  highlights: string[];
  link: string;
  source_label: string;
  raw_text: string;
}

function parseItems(html: string, maxItems: number): NewsItem[] {
  const items: NewsItem[] = [];

  // 从 title 提取分类
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const fullTitle = titleMatch ? titleMatch[1] : "";
  // 📡 2026-07-02 23:00 · 开源与模型 → 开源与模型
  const category = fullTitle.split("·").pop()?.trim() || "技术资讯";

  // 按 <hr/> 分割条目
  const sections = html.split(/<hr\s*\/?>/);

  for (const section of sections) {
    if (items.length >= maxItems) break;

    // 提取 h3 标题（项目名）
    const h3Match = section.match(/<h3>([^<]+)<\/h3>/);
    if (!h3Match) continue;
    const itemTitle = h3Match[1].trim();

    // 跳过分类大标题（h2 级别的）
    if (itemTitle.includes("热门") || itemTitle.includes("精选") || itemTitle.includes("要闻")) continue;

    // 提取描述段落（第一个 <p>，排除指标行和链接行）
    const paragraphs: string[] = [];
    const pRegex = /<p>([^<]*)<\/p>/g;
    let pMatch;
    while ((pMatch = pRegex.exec(section)) !== null) {
      const text = pMatch[1].trim();
      if (!text) continue;
      if (text.startsWith("⭐")) continue;  // 指标行
      if (text.startsWith("https:")) continue; // 链接行
      paragraphs.push(text);
    }

    const description = paragraphs[0] || "";
    const commentary = paragraphs.find((p) => p.length > 50 && p !== description) || "";

    // 提取指标
    const metrics: Record<string, string> = {};
    const starsMatch = section.match(/⭐\s*([\d.]+k?)/);
    const forksMatch = section.match(/🍴\s*(\d+)/);
    const langMatch = section.match(/⭐[^|]*\|[^|]*\|\s*(\w+)/);
    const upvotesMatch = section.match(/[▲⬆]\s*([\d.]+k?)/);
    const commentsMatch = section.match(/💬\s*([\d.]+k?)/);

    if (starsMatch) metrics.stars = starsMatch[1];
    if (forksMatch) metrics.forks = forksMatch[1];
    if (langMatch) metrics.language = langMatch[1].trim();
    if (upvotesMatch) metrics.upvotes = upvotesMatch[1];
    if (commentsMatch) metrics.comments = commentsMatch[1];

    // 提取链接（处理转义引号）
    const linkMatch = section.match(/<a\s+href=\\?"([^"\\]+)"/);
    const link = linkMatch ? linkMatch[1] : "";

    // 组装 raw_text（描述 + 评论）
    const rawText = [description, commentary].filter(Boolean).join(" ");

    // 跳过内容太少的条目
    if (rawText.length < 30) continue;

    // 从标题提取简洁名称（冒号前或全名）
    const cleanTitle = itemTitle.split("：")[0].split(":")[0].split("—")[0].trim();

    items.push({
      category: mapCategory(fullTitle),
      title: cleanTitle.length > 40 ? cleanTitle.substring(0, 40) : cleanTitle,
      subtitle: description.length > 120 ? description.substring(0, 120) : description,
      metrics,
      highlights: extractHighlights(description, commentary),
      link,
      source_label: detectSource(fullTitle, link),
      raw_text: rawText,
    });
  }

  return items;
}

// ── 分类映射 ──
function mapCategory(docTitle: string): string {
  if (docTitle.includes("开源") || docTitle.includes("模型")) return "🔧 开源与模型";
  if (docTitle.includes("社区") || docTitle.includes("热议")) return "💬 社区热议";
  if (docTitle.includes("产品") || docTitle.includes("商业")) return "💰 产品与商业";
  return "📡 技术资讯";
}

// ── 来源检测 ──
function detectSource(docTitle: string, link: string): string {
  if (link.includes("github.com")) return "GitHub Trending";
  if (link.includes("huggingface.co")) return "HuggingFace";
  if (link.includes("reddit.com")) return "Reddit";
  if (link.includes("news.ycombinator.com")) return "Hacker News";
  if (link.includes("producthunt.com")) return "Product Hunt";
  if (docTitle.includes("社区")) return "HN/Reddit";
  if (docTitle.includes("产品")) return "ProductHunt/Techmeme";
  return "技术情报雷达";
}

// ── 从描述提取亮点 ──
function extractHighlights(desc: string, commentary: string): string[] {
  const highlights: string[] = [];
  // 从描述中提取关键句
  const sentences = desc.split(/[。；！？\n]/).filter((s) => s.length > 10 && s.length < 50);
  highlights.push(...sentences.slice(0, 3));
  // 补足 3 条
  while (highlights.length < 3 && highlights.length < sentences.length) {
    highlights.push(sentences[highlights.length]);
  }
  return highlights.slice(0, 3);
}

// ── 提取日期 ──
function extractDate(html: string): string {
  const match = html.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

// ── 生成 run 目录 ──
function createRunDir(): string {
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const runId =
    `run-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
    `-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const runDir = path.join(ROOT, "output", runId);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

// ── 主流程 ──
(async () => {
  const { url, out: outPathArg, maxItems } = parseArgs();

  if (!url) {
    console.error("✘ 请提供飞书文档链接: --url \"https://...\"");
    process.exit(1);
  }

  // 创建 run 目录（除非用户显式指定了 --out）
  const runDir = outPathArg ? path.dirname(outPathArg) : createRunDir();
  const outPath = outPathArg || path.join(runDir, "news-data.json");

  // Step 1: 提取 token
  const token = extractDocToken(url);
  console.log(`📄 文档 token: ${token}`);

  // Step 2: 抓取内容
  console.log(`⬇️ 抓取飞书文档...`);
  const html = fetchFeishuDoc(token);
  console.log(`✔ 文档内容: ${html.length} 字符`);

  // Step 3: 解析条目
  console.log(`🔍 解析资讯条目 (最多 ${maxItems} 条)...`);
  const items = parseItems(html, maxItems);
  console.log(`✔ 解析出 ${items.length} 条`);

  items.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.title} (${item.raw_text.length}字)`);
  });

  // Step 4: 组装数据
  const date = extractDate(html);
  const newsData = {
    date,
    intro: {
      title: "AI 开源速递",
      subtitle: `${date} · 共${items.length}个精选项目`,
    },
    outro: {
      title: "今天就到这里",
      subtitle: "明天同一时间见 👋",
    },
    items,
    // ⚠ transitions 和 items[].script 需由 AI Agent 补充
    _needs_scripts: true,
  };

  // Step 5: 写出
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(newsData, null, 2));
  console.log(`\n✅ 数据已保存 → ${outPath}`);
  console.log(`📁 run 目录: ${runDir}`);
  console.log(`⚠ 下一步: Agent 读取 ${outPath}，生成口播稿(script)和转场(transitions)字段，写回后传给 make-video.ts --data`);
})();
