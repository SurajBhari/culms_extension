// End-to-end check: loads the unpacked extension into Chromium, points it at
// the mock LMS (mock.mjs) and walks through what a student would do.
//
//   npm test            (or: node test/run.mjs)
//
// Screenshots land in test/out/ so the result can be looked at, not just
// asserted on.
import { chromium } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { respond, log } from "./mock.mjs";

const EXT = fileURLToPath(new URL("..", import.meta.url));
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`  ok    ${name}`);
  } catch (err) {
    failures++;
    results.push(`  FAIL  ${name}\n        ${String(err.message || err).split("\n").join("\n        ")}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const profile = mkdtempSync(join(tmpdir(), "culms-ext-"));

// A real HTTPS server rather than page.route(): Playwright does not intercept
// the request that follows a mocked redirect, and the LMS redirects a lot
// (resource -> pluginfile, resource -> Office viewer, expired -> login).
// Chromium is pointed at it with a host-resolver rule, so the page origin is
// still https://lms.cuchd.in and the content scripts match as in real use.
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
const port = server.address().port;
const ctx = await chromium.launchPersistentContext(profile, {
  // Extensions need Chromium's full ("new") headless mode, not headless-shell.
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    `--host-resolver-rules=MAP lms.cuchd.in:443 127.0.0.1:${port}`,
    "--no-proxy-server",
  ],
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});
// The captured pages reference CDNs; keep the test offline.
await ctx.route((url) => url.hostname !== "lms.cuchd.in" && /^https?:$/.test(url.protocol), (r) => r.abort());
// The extension only ever uses fetch(). Any fetch to a host other than
// lms.cuchd.in would be a server it must not use.
const hosts = new Set();
ctx.on("request", (r) => {
  if (r.resourceType() === "fetch" || r.resourceType() === "xhr") hosts.add(new URL(r.url()).host);
});
const page = ctx.pages()[0] || (await ctx.newPage());
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" && /CULMS/.test(m.text())) errors.push(m.text());
});
page.on("pageerror", (e) => {
  if (/content|CULMS|cs-/.test(e.stack || "")) errors.push(String(e));
});

const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

try {
  await check("dashboard is replaced by the simple view", async () => {
    await page.goto("https://lms.cuchd.in/my/");
    await page.waitForSelector("#culms-simple .cs-course", { timeout: 15000 });
    const n = await page.locator(".cs-course").count();
    assert(n === 5, `expected 5 courses, got ${n}`);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(bg !== "rgb(255, 0, 0)", "Moodle's stylesheet is still applied");
    const extraBody = await page.evaluate(() => [...document.body.children].filter((c) => c.id !== "culms-simple").length);
    assert(extraBody === 0, `${extraBody} Moodle elements left in <body>`);
    const greet = await page.textContent("h1");
    assert(greet === "Hi, Suraj", `greeting was "${greet}"`);
    assert(!(await page.evaluate(() => document.documentElement.classList.contains("culms-pending"))), "loading cover never removed");
  });

  await check("upcoming deadlines are shown, overdue flagged", async () => {
    await page.waitForSelector(".cs-upcoming:not([hidden]) .cs-row");
    assert((await page.locator(".cs-upcoming .cs-row").count()) === 2, "expected 2 events");
    assert((await page.locator(".cs-upcoming .cs-row.overdue").count()) === 1, "overdue event not flagged");
    await shot("1-dashboard");
  });

  await check("opening a course lists units, chapters and files", async () => {
    await page.click('.cs-course:has-text("DECISION SCIENCE"):has(.cs-chip)');
    await page.waitForURL(/course\/view\.php\?id=125833$/);
    await page.waitForFunction(() => document.querySelector(".cs-muted")?.textContent === "Up to date", null, { timeout: 15000 });
    const units = await page.locator(".cs-unit-title").evaluateAll((els) => els.map((e) => e.firstChild.textContent));
    assert(JSON.stringify(units) === JSON.stringify(["Course Overview", "Unit-1", "Unit-2", "Unit-3"]), `units: ${units}`);
    const chapters = await page.locator(".cs-chapter:visible h3").allTextContents();
    assert(chapters.includes("Chapter 1.1") && chapters.includes("Chapter 3.3"), `chapters: ${chapters}`);
    assert(!chapters.includes("Chapter 2.1"), "empty chapter 2.1 should be hidden");
    assert(await page.locator('.cs-item:has-text("E-BOOK") .cs-tile.k-pdf').first().isVisible(), "E-BOOK not shown as a PDF");
    assert(await page.locator('.cs-item:has-text("LECTURE PLAN")').isVisible(), "LECTURE PLAN (section 0) missing");
    const href = await page.locator('.cs-item:has-text("E-BOOK") a.cs-name').first().getAttribute("href");
    assert(/mod\/resource\/view\.php\?id=3486103&redirect=1/.test(href), `file link was ${href}`);
    await shot("2-course");
  });

  await check("unit chips jump to a unit; units count their files", async () => {
    const chips = await page.locator(".cs-jump a").allTextContents();
    assert(chips.join("|") === "Course Overview|Unit-1|Unit-2|Unit-3", `chips: ${chips}`);
    assert((await page.textContent("#cs-sec-1 .cs-unit-count")) === "5 files", "Unit-1 file count");
    await page.click('.cs-jump a:has-text("Unit-3")');
    await page.waitForFunction(() => {
      const r = document.getElementById("cs-sec-9").getBoundingClientRect();
      const bar = document.querySelector(".cs-jump").getBoundingClientRect();
      return Math.abs(r.top - (bar.bottom + 16)) < 30;
    }, null, { timeout: 5000 });
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  await check("download resolves the real file and its size", async () => {
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator('.cs-item:has-text("E-BOOK") .cs-icon-btn').first().click(),
    ]);
    assert(dl.suggestedFilename() === "E-BOOK-3486103.pdf", `downloaded ${dl.suggestedFilename()}`);
    await page.waitForFunction(() => /1\.2 MB/.test(document.querySelector(".cs-item .cs-meta")?.textContent || "") || [...document.querySelectorAll(".cs-item")].some((x) => /E-BOOK/.test(x.textContent) && /1\.2 MB/.test(x.textContent)));
  });

  await check("Office files download the original, not the viewer page", async () => {
    const row = page.locator('.cs-item:has-text("Rights-based ethics")');
    assert(await row.locator(".cs-tile.k-ppt").isVisible(), "pptx not shown as PPT");
    const [dl] = await Promise.all([page.waitForEvent("download"), row.locator(".cs-icon-btn").click()]);
    assert(dl.suggestedFilename() === "Topic 3.2.5 - Rights-based ethics; Challenges.pptx", `downloaded ${dl.suggestedFilename()}`);
  });

  await check("folders expand to their files; labels, links and locks render", async () => {
    const wrap = page.locator('.cs-item-wrap:has-text("Previous year papers")');
    await wrap.locator(".cs-icon-btn").click();
    await wrap.locator(".cs-subfile").first().waitFor();
    assert((await wrap.locator(".cs-subfile").count()) === 2, "folder files missing");
    assert(await page.locator('.cs-label:has-text("Read chapter 4")').isVisible(), "label text missing");
    const url = await page.locator('.cs-item:has-text("NPTEL") a.cs-name').getAttribute("href");
    assert(/redirect=1/.test(url), "URL activity should go straight to the link");
    assert(await page.locator('.cs-item:has-text("Chapter quiz") .cs-lock').isVisible(), "restriction not shown");
    await page.locator("#cs-sec-3").screenshot({ path: join(OUT, "3-chapter.png") });
  });

  await check("'Material only' hides forums and quizzes", async () => {
    await page.check(".cs-switch input");
    assert(!(await page.locator('.cs-item:has-text("Chapter quiz")').isVisible()), "quiz still visible");
    assert(await page.locator('.cs-item:has-text("E-BOOK")').first().isVisible(), "files hidden too");
    await page.uncheck(".cs-switch input");
  });

  await check("search finds files across opened courses", async () => {
    await page.fill(".cs-search input", "ebook unit");
    let n = await page.locator(".cs-results .cs-item").count();
    assert(n === 0, "'ebook' should not match 'E-BOOK'... sanity");
    await page.fill(".cs-search input", "e-book 2.");
    await page.waitForSelector(".cs-results .cs-item");
    n = await page.locator(".cs-results .cs-item").count();
    assert(n >= 1, "no results");
    const ctxText = await page.locator(".cs-results .cs-item .cs-meta").first().textContent();
    assert(/^PDF · DECISION SCIENCE \(CONT\) › Chapter 1\.1$/.test(ctxText), `result context: ${ctxText}`);
    await shot("4-search");
    await page.fill(".cs-search input", "");
    await page.waitForSelector(".cs-unit-title");
  });

  await check("a reload on a course page renders it straight away", async () => {
    await page.reload();
    await page.waitForSelector(".cs-unit-title");
    assert((await page.locator(".cs-unit-title").count()) === 4, "units missing after reload");
  });

  await check("back button returns to the course list", async () => {
    await page.click(".cs-back");
    await page.waitForURL(/\/my\/$/);
    await page.waitForSelector(".cs-course");
    await page.goBack();
    await page.waitForSelector(".cs-unit-title");
    await page.goto("https://lms.cuchd.in/my/");
    await page.waitForSelector(".cs-course");
    const meta = await page.locator('.cs-course:has(.cs-chip) .cs-meta').first().textContent();
    assert(/files?, \d+ items?/.test(meta), `course card lacks counts: ${meta}`);
  });

  await check("a topics-format course (all sections on one page) works", async () => {
    await page.click('.cs-course:has-text("MARKETING")');
    await page.waitForSelector('.cs-item:has-text("Pricing worksheet")');
    const units = await page.locator(".cs-unit-title").evaluateAll((els) => els.map((e) => e.firstChild.textContent));
    assert(units.join("|") === "General|Week 1 — The marketing mix", `units: ${units}`);
    assert(await page.locator('.cs-item:has-text("Pricing worksheet") .k-xls').isVisible(), "xls tile");
  });

  await check("a course with no content says so", async () => {
    await page.goto("https://lms.cuchd.in/course/view.php?id=125901");
    await page.waitForSelector(".cs-unit .cs-empty");
  });

  await check("an expired session shows the log-in banner", async () => {
    await page.goto("https://lms.cuchd.in/my/");
    await page.click('.cs-course:has-text("EXPIRED")');
    await page.waitForSelector(".cs-banner:not([hidden])");
    const t = await page.textContent(".cs-banner");
    assert(/session has ended/.test(t), t);
  });

  await check("'Search all courses' indexes everything", async () => {
    await page.goto("https://lms.cuchd.in/my/");
    await page.waitForSelector(".cs-course");
    await page.fill(".cs-search input", "syllabus");
    await page.waitForSelector(".cs-results, .cs-empty");
    const btn = page.locator('button:has-text("Search all")');
    if (await btn.count()) await btn.click();
    await page.waitForSelector('.cs-results .cs-item:has-text("Syllabus")', { timeout: 15000 });
    await page.fill(".cs-search input", "");
  });

  await check("activity pages keep Moodle but get a 'Simple view' button", async () => {
    await page.goto("https://lms.cuchd.in/mod/forum/view.php?id=3400423");
    await page.waitForSelector("a.culms-pill");
    assert((await page.getAttribute("a.culms-pill", "href")) === "/course/view.php?id=125833", "pill should lead back to the course");
    assert(!(await page.locator("#culms-simple").count()), "activity page should not be taken over");
  });

  await check("'Original site' turns it off, the pill turns it back on", async () => {
    await page.goto("https://lms.cuchd.in/my/");
    await page.waitForSelector(".cs-menu");
    await Promise.all([page.waitForEvent("load"), page.click('.cs-menu a:has-text("Original site")')]);
    await page.waitForSelector("a.culms-pill");
    assert(!(await page.locator("#culms-simple").count()), "still simple after turning off");
    await Promise.all([page.waitForEvent("load"), page.click("a.culms-pill")]);
    await page.waitForSelector("#culms-simple .cs-course");
  });

  await check("#original opens one course on the original site", async () => {
    await page.goto("https://lms.cuchd.in/course/view.php?id=125833#original");
    await page.waitForSelector("a.culms-pill");
    assert(!(await page.locator("#culms-simple").count()), "taken over despite #original");
  });

  await check("login page is left alone", async () => {
    await page.goto("https://lms.cuchd.in/login/index.php");
    await page.waitForSelector('input[name="username"]');
    assert(!(await page.locator("#culms-simple, a.culms-pill").count()), "touched the login page");
    const hidden = await page.evaluate(() => document.documentElement.classList.contains("culms-pending"));
    assert(!hidden, "login page hidden");
  });

  await check("phone width and dark mode render", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("https://lms.cuchd.in/course/view.php?id=125833");
    await page.waitForSelector(".cs-unit-title");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 0, `horizontal overflow of ${overflow}px on a phone`);
    await shot("5-phone");
    await page.click('.cs-jump a:has-text("Unit-2")');
    await page.waitForFunction(() => Math.abs(document.getElementById("cs-sec-5").getBoundingClientRect().top - (document.querySelector(".cs-jump").getBoundingClientRect().bottom + 16)) < 30, null, { timeout: 5000 });
    await page.screenshot({ path: join(OUT, "5-phone-jump.png") });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("https://lms.cuchd.in/my/");
    await page.waitForSelector(".cs-course");
    await shot("6-dark");
  });

  await check("no errors from the extension", async () => {
    assert(!errors.length, errors.join("\n"));
  });

  await check("no server other than lms.cuchd.in was contacted", async () => {
    const others = [...hosts].filter((x) => x !== "lms.cuchd.in");
    assert(!others.length, `also contacted: ${others.join(", ")}`);
  });
} finally {
  await ctx.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}

console.log(results.join("\n"));
console.log(`\n${results.length - failures} passed, ${failures} failed · ${log.length} requests, all to ${[...hosts].join(", ")}`);
process.exit(failures ? 1 : 0);
