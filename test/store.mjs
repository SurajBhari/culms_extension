// Renders the Chrome Web Store images from the mock LMS (mock.mjs), so no real
// student data ends up in the listing:
//
//   npm run store-images
//
// Writes 1280x800 screenshots and the 440x280 promo tile to store/.
import { chromium } from "playwright";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { respond, COURSES } from "./mock.mjs";

const EXT = fileURLToPath(new URL("..", import.meta.url));
const OUT = fileURLToPath(new URL("../store/", import.meta.url));
mkdirSync(OUT, { recursive: true });

// The expired course only exists to test the log-in banner.
COURSES.splice(COURSES.findIndex((c) => c.id === 999), 1);

const profile = mkdtempSync(join(tmpdir(), "culms-store-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=lms.cuchd.in",
  "-keyout", join(profile, "key.pem"), "-out", join(profile, "cert.pem")], { stdio: "ignore" });
const server = createServer({ key: readFileSync(join(profile, "key.pem")), cert: readFileSync(join(profile, "cert.pem")) }, (req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const out = respond({ method: req.method, url: new URL(req.url, "https://lms.cuchd.in"), headers: req.headers, body: Buffer.concat(chunks).toString() });
    res.writeHead(out.status, out.headers);
    res.end(out.body);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    `--host-resolver-rules=MAP lms.cuchd.in:443 127.0.0.1:${server.address().port}`,
    "--no-proxy-server",
  ],
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 800 },
});
await ctx.route((url) => url.hostname !== "lms.cuchd.in" && /^https?:$/.test(url.protocol), (r) => r.abort());
const page = ctx.pages()[0] || (await ctx.newPage());
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });

try {
  // Load every course first so the cards carry their counts.
  await page.goto("https://lms.cuchd.in/my/");
  await page.waitForSelector(".cs-course");
  await page.click('button:has-text("Refresh all")');
  await page.waitForFunction(() => /up to date/.test(document.querySelector(".cs-actions .cs-muted")?.textContent || ""), null, { timeout: 60000 });
  await page.goto("https://lms.cuchd.in/my/");
  await page.waitForSelector(".cs-assess-line");
  await shot("1-dashboard");

  await page.goto("https://lms.cuchd.in/course/view.php?id=125900");
  await page.waitForSelector('.cs-assess [data-status="9000002"].t-done');
  await shot("2-course-assessments");
  await page.evaluate(() => document.getElementById("cs-sec-125833-1").scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await shot("3-course-units");

  await page.goto("https://lms.cuchd.in/calendar/view.php?view=month");
  await page.waitForSelector(".cs-agenda:not([hidden])");
  await shot("4-calendar");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("https://lms.cuchd.in/my/");
  await page.waitForSelector(".cs-course");
  await page.fill(".cs-search input", "e-book");
  await page.waitForSelector(".cs-results .cs-item");
  await shot("5-search-dark");
  await page.emulateMedia({ colorScheme: "light" });

  const icon = readFileSync(join(EXT, "icons/icon128.png")).toString("base64");
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div style="width:440px;height:280px;box-sizing:border-box;padding:36px;display:flex;flex-direction:column;justify-content:center;gap:18px;
      background:#1a56db;color:#fff;font-family:system-ui,'Segoe UI',Roboto,sans-serif">
      <div style="display:flex;align-items:center;gap:14px">
        <img src="data:image/png;base64,${icon}" width="56" height="56" style="border-radius:12px;box-shadow:0 0 0 2px rgba(255,255,255,.35)">
        <div style="font-size:30px;font-weight:700;letter-spacing:-.01em">CULMS Simple</div>
      </div>
      <div style="font-size:19px;line-height:1.35;opacity:.95">Your CU LMS as a clean list:<br>courses, units, files, deadlines.</div>
    </div></body></html>`);
  await page.screenshot({ path: join(OUT, "promo-440x280.png") });
} finally {
  await ctx.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`Store images written to ${OUT}`);
