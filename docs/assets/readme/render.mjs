// Uses the canva-decking HTML-to-PNG workflow. No application or provider calls.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(join(root, "package.json"));
const webRequire = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("playwright-core");
const ts = require("typescript");
const React = webRequire("react");
const { renderToStaticMarkup } = webRequire("react-dom/server");

// Render the real onboarding component with its existing geometry and CSS.
function sourceModule(relativePath) {
  const fileName = join(root, relativePath);
  const output = ts.transpileModule(readFileSync(fileName, "utf8"), {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const resolve = (name) => {
    if (name.endsWith(".module.css")) {
      return { default: new Proxy({}, { get: (_, key) => key }) };
    }
    if (name === "@/data/avatar-geometry") {
      return sourceModule("apps/web/src/data/avatar-geometry.ts");
    }
    return webRequire(name);
  };
  // This executes only repository-owned TypeScript, with no external input.
  new Function("require", "module", "exports", output)(resolve, module, module.exports);
  return module.exports;
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const [name, width, height, scale] of [
    ["showcase", 1500, 960, 1],
    ["architecture", 1500, 1060, 2],
    ["social-preview", 1280, 640, 1],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.goto(pathToFileURL(join(directory, "src", `${name}.html`)).href);
    await page.evaluate(() => document.fonts.ready);
    const problems = await page.evaluate(() => {
      const missing = [...document.images].filter((image) => !image.naturalWidth);
      const clipped = [
        ...document.querySelectorAll(".node, .copy, figcaption, .note, .rule"),
      ].filter(
        (element) =>
          element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
      );
      return {
        missing: missing.map((image) => image.src),
        clipped: clipped.map((element) => element.textContent),
      };
    });
    if (problems.missing.length || problems.clipped.length) {
      throw new Error(`${name}: ${JSON.stringify(problems)}`);
    }
    await page
      .locator("#w")
      .screenshot({ path: join(directory, `${name}.png`), omitBackground: true });
    await page.close();
    process.stdout.write(`Rendered ${name}.png\n`);
  }

  const frames = mkdtempSync(join(tmpdir(), "monara-readme-avatar-"));
  try {
    const { OnboardingAvatar } = sourceModule("apps/web/src/components/onboarding-avatar.tsx");
    const markup = renderToStaticMarkup(React.createElement(OnboardingAvatar, { scene: "import" }));
    const css = readFileSync(
      join(root, "apps/web/src/components/onboarding-avatar.module.css"),
      "utf8",
    );
    const document = `<!doctype html><html><head><meta charset="utf-8"><style>
      :root{--brand:#3171fd;--border:#dae8f3;--line-strong:#a7bbce;--warning:#e8b748;--warning-foreground:#483216}
      body{margin:0;background:transparent}#w{width:360px;height:220px}${css}
      </style></head><body><div id="w">${markup}</div></body></html>`;
    const page = await browser.newPage({
      viewport: { width: 360, height: 220 },
      deviceScaleFactor: 1,
    });
    await page.setContent(document);
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.pause();
    });
    const frameCount = 78;
    for (let frame = 0; frame < frameCount; frame++) {
      // Warm up delayed receipts, then capture one full 5.2-second blink cycle at 15 fps.
      await page.evaluate(
        (time) => {
          for (const animation of document.getAnimations()) animation.currentTime = time;
        },
        5200 + (frame * 1000) / 15,
      );
      await page.locator("#w").screenshot({
        path: join(frames, `${String(frame).padStart(3, "0")}.png`),
        omitBackground: true,
        animations: "allow",
      });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .locator("#w")
      .screenshot({ path: join(directory, "monara-avatar.png"), omitBackground: true });
    await page.close();
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-framerate",
      "15",
      "-i",
      join(frames, "%03d.png"),
      "-filter_complex",
      "[0:v]split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=dither=sierra2_4a:alpha_threshold=128",
      "-loop",
      "0",
      join(directory, "monara-avatar.gif"),
    ]);
    process.stdout.write(
      "Rendered monara-avatar.gif and reduced-motion PNG from the onboarding component\n",
    );
  } finally {
    rmSync(frames, { recursive: true, force: true });
  }
} finally {
  await browser.close();
}
