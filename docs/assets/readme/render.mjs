// Uses the canva-decking HTML-to-PNG workflow. No application or provider calls.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    ["architecture", 1500, 1110, 2],
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
    const markup = renderToStaticMarkup(
      React.createElement(OnboardingAvatar, { scene: "import" }),
    ).replace('viewBox="0 0 360 220"', 'viewBox="90 0 220 220"');
    const css = readFileSync(
      join(root, "apps/web/src/components/onboarding-avatar.module.css"),
      "utf8",
    );
    const page = await browser.newPage({
      viewport: { width: 720, height: 200 },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      readFileSync(join(root, "apps/web/public/logos/monara-lockup-light.svg"), "utf8"),
    );
    const lettering = await page.evaluate(() => {
      // The supplied lockup contains the cat path followed by the original lettering.
      const path = document.querySelectorAll("svg > g > path")[1];
      if (!(path instanceof SVGPathElement)) throw new Error("Monara lettering path is missing");
      const box = path.getBBox();
      return { path: path.outerHTML, viewBox: `${box.x} ${box.y} ${box.width} ${box.height}` };
    });
    const document = `<!doctype html><html><head><meta charset="utf-8"><style>
      :root{--brand:#3171fd;--wordmark:#3171fd;--border:#dae8f3;--line-strong:#a7bbce;--warning:#e8b748;--warning-foreground:#483216}
      body{margin:0;background:transparent}#w{position:relative;width:720px;height:200px}
      .avatar{position:absolute;left:0;top:0;width:200px;height:200px}
      .wordmark{position:absolute;left:204px;top:80px;width:500px;height:auto;fill:var(--wordmark)}${css}
      </style></head><body><div id="w"><div class="avatar">${markup}</div>
      <svg class="wordmark" viewBox="${lettering.viewBox}">${lettering.path}</svg></div></body></html>`;
    await page.setContent(document);
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.pause();
    });
    for (const theme of ["light", "dark"]) mkdirSync(join(frames, theme));
    const frameCount = 78;
    for (let frame = 0; frame < frameCount; frame++) {
      // Warm up delayed receipts, then capture one full 5.2-second blink cycle at 15 fps.
      await page.evaluate(
        (time) => {
          for (const animation of document.getAnimations()) animation.currentTime = time;
        },
        5200 + (frame * 1000) / 15,
      );
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (color) => {
            document.documentElement.style.setProperty("--wordmark", color);
          },
          theme === "dark" ? "#ffffff" : "#3171fd",
        );
        await page.locator("#w").screenshot({
          path: join(frames, theme, `${String(frame).padStart(3, "0")}.png`),
          omitBackground: true,
          animations: "allow",
        });
      }
    }
    await page.close();
    for (const theme of ["light", "dark"])
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        "15",
        "-i",
        join(frames, theme, "%03d.png"),
        "-filter_complex",
        "[0:v]split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=dither=sierra2_4a:alpha_threshold=128",
        "-loop",
        "0",
        join(directory, `monara-lockup-${theme}.gif`),
      ]);
    process.stdout.write(
      "Rendered light and dark animated lockups from the onboarding cat and original lettering\n",
    );
  } finally {
    rmSync(frames, { recursive: true, force: true });
  }
} finally {
  await browser.close();
}
