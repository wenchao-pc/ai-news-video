/**
 * 模板渲染引擎 — 读取 HTML 模板，填充 {{变量}}，用 Playwright 截图为 PNG
 *
 * 用法:
 *   tsx scripts/generate-ppt.ts --data examples/mock-news.json --template terminal --out output/slides
 *
 * 输出:
 *   output/slides/00_intro.png
 *   output/slides/01_xxx.png
 *   ...
 *   output/slides/99_outro.png
 *   output/slides/manifest.json   (每页的序号/类型/对应音频文件名)
 */

import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── CLI args ──────────────────────────────────────
function parseArgs(): {
  data: string;
  template: string;
  out: string;
} {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const i = args.indexOf(`--${key}`);
    return i >= 0 ? args[i + 1] : null;
  };
  const data = get("data") || path.join(ROOT, "examples", "mock-news.json");
  const template = get("template") || "terminal";
  const out = get("out") || path.join(ROOT, "output", "slides");
  return { data, template, out };
}

// ── 模板变量填充 ────────────────────────────────────
function fillTemplate(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val ?? "");
  }
  // 清除未填充的占位符
  result = result.replace(/\{\{[^}]+\}\}/g, "");
  return result;
}

// ── 指标标签映射 ────────────────────────────────────
function getMetricLabels(item: any): Record<string, string> {
  // 根据数据中有什么字段推断标签
  if (item.metrics.stars) return { metrics_label_1: "⭐", metrics_label_2: "↑", metrics_label_3: "" };
  if (item.metrics.upvotes) return { metrics_label_1: "▲", metrics_label_2: "💬", metrics_label_3: "" };
  if (item.metrics.valuation) return { metrics_label_1: "💰", metrics_label_2: "📈", metrics_label_3: "" };
  return { metrics_label_1: "", metrics_label_2: "", metrics_label_3: "" };
}

// ── 为每条 item 构建模板变量 ────────────────────────
function itemToVars(item: any, dateStr: string): Record<string, string> {
  const labels = getMetricLabels(item);
  const metricsValues = Object.values(item.metrics || {});
  return {
    date: dateStr,
    category: item.category || "",
    title: item.title || "",
    subtitle: item.subtitle || "",
    slug: (item.title || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    stars: metricsValues[0] || "",
    today: metricsValues[1] || "",
    language: metricsValues[2] || "",
    highlight_1: item.highlights?.[0] || "",
    highlight_2: item.highlights?.[1] || "",
    highlight_3: item.highlights?.[2] || "",
    link: item.link || "",
    source: item.source_label || "",
    ...labels,
  };
}

// ── 主流程 ──────────────────────────────────────────
(async () => {
  const { data: dataPath, template: templateName, out: outDir } = parseArgs();

  // 加载数据
  const newsData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const dateStr = newsData.date || new Date().toISOString().slice(0, 10);

  // 加载模板
  const tplDir = path.join(ROOT, "templates", templateName);
  if (!fs.existsSync(tplDir)) {
    console.error(`✘ 模板不存在: ${templateName}\n可用模板: ${fs.readdirSync(path.join(ROOT, "templates")).join(", ")}`);
    process.exit(1);
  }

  const slideTpl = fs.readFileSync(path.join(tplDir, "slide.html"), "utf-8");
  const introTpl = fs.existsSync(path.join(tplDir, "intro.html"))
    ? fs.readFileSync(path.join(tplDir, "intro.html"), "utf-8") : null;
  const outroTpl = fs.existsSync(path.join(tplDir, "outro.html"))
    ? fs.readFileSync(path.join(tplDir, "outro.html"), "utf-8") : null;
  const coverTpl = fs.existsSync(path.join(tplDir, "cover.html"))
    ? fs.readFileSync(path.join(tplDir, "cover.html"), "utf-8") : null;

  // 输出目录
  fs.mkdirSync(outDir, { recursive: true });

  // 准备页面列表
  const pages: { type: string; index: number; vars: Record<string, string> }[] = [];

  // 片头
  if (introTpl && newsData.intro) {
    pages.push({
      type: "intro",
      index: 0,
      vars: { title: newsData.intro.title, subtitle: newsData.intro.subtitle, date: dateStr },
    });
  }

  // 内容页
  newsData.items.forEach((item: any, i: number) => {
    pages.push({ type: "slide", index: i + 1, vars: itemToVars(item, dateStr) });
  });

  // 片尾
  if (outroTpl && newsData.outro) {
    pages.push({
      type: "outro",
      index: 99,
      vars: { title: newsData.outro.title, subtitle: newsData.outro.subtitle, date: dateStr },
    });
  }

  // 启动浏览器
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const manifest: any[] = [];

  for (const page of pages) {
    // 选择模板
    let html: string;
    if (page.type === "intro" && introTpl) html = introTpl;
    else if (page.type === "outro" && outroTpl) html = outroTpl;
    else html = slideTpl;

    const filled = fillTemplate(html, page.vars);
    const htmlFile = path.join(outDir, `_tmp_${page.type}_${page.index}.html`);
    fs.writeFileSync(htmlFile, filled);

    // 截图
    const browserPage = await context.newPage();
    await browserPage.goto("file://" + htmlFile, { waitUntil: "networkidle" });
    await browserPage.waitForTimeout(1000); // 等字体加载

    const num = String(page.index).padStart(2, "0");
    const pngName = `${num}_${page.type}.png`;
    await browserPage.screenshot({ path: path.join(outDir, pngName) });
    await browserPage.close();
    fs.unlinkSync(htmlFile); // 清理临时 HTML

    console.log(`✔ ${pngName}`);
    manifest.push({
      png: pngName,
      type: page.type,
      index: page.index,
      title: page.vars.title || "",
      // 音频文件名 — 给 generate-audio.ts 使用
      audio: pngName.replace(".png", ".mp3"),
    });
  }

  await browser.close();

  // 生成封面
  if (coverTpl) {
    const coverVars: Record<string, string> = {
      date: dateStr,
      title: newsData.intro?.title || "今日精选",
      subtitle: newsData.intro?.subtitle || "",
      count: String(newsData.items.length),
      duration: String(Math.ceil(manifest.length * 0.4)), // 粗估分钟
      categories: String(new Set(newsData.items.map((i: any) => i.category)).size),
    };
    const coverHtml = fillTemplate(coverTpl, coverVars);
    const coverFile = path.join(outDir, "_tmp_cover.html");
    fs.writeFileSync(coverFile, coverHtml);

    const browser2 = await chromium.launch();
    const ctx2 = await browser2.newContext({ viewport: { width: 1920, height: 1080 } });
    const p = await ctx2.newPage();
    await p.goto("file://" + coverFile, { waitUntil: "networkidle" });
    await p.waitForTimeout(1000);
    // cover.png 输出到 PPT 输出目录（与 slides 同级），同时复制一份到 output/cover.png 保持兼容
    const coverPath = path.join(outDir, "..", "cover.png");
    const coverPathLegacy = path.join(ROOT, "output", "cover.png");
    await p.screenshot({ path: coverPath });
    try { fs.copyFileSync(coverPath, coverPathLegacy); } catch {}
    await p.close();
    await browser2.close();
    fs.unlinkSync(coverFile);
    console.log(`✔ cover.png → ${coverPath}`);
  }

  // 写 manifest.json
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n✅ ${manifest.length} 页 PNG 生成完毕 → ${outDir}`);
})();
