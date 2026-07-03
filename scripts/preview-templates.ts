import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TEMPLATES = [
  { name: "a-terminal", html: "template-a-terminal.html" },
  { name: "b-hud", html: "template-b-hud.html" },
  { name: "c-minimal", html: "template-c-minimal.html" }
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });

  const outDir = path.join(ROOT, "output", "preview");
  fs.mkdirSync(outDir, { recursive: true });

  for (const t of TEMPLATES) {
    const page = await context.newPage();
    const htmlPath = path.join(ROOT, "templates", t.html);
    await page.goto("file://" + htmlPath, { waitUntil: "networkidle" });
    await page.waitForTimeout(800); // wait for Google fonts
    const outPath = path.join(outDir, `preview-${t.name}.png`);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`✔ ${t.name} -> ${outPath}`);
    await page.close();
  }

  await browser.close();
})();
