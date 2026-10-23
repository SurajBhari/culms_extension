// A stand-in for lms.cuchd.in, built from pages captured off the live site
// (culms-connector's scrubbed fixtures). Every request the browser makes to
// https://lms.cuchd.in/ is answered here, so the extension runs exactly as it
// would on the real host without needing a login.
import { readFileSync } from "node:fs";

const here = new URL("./fixtures/", import.meta.url);
const fixture = (name) =>
  readFileSync(new URL(name, here), "utf8").replaceAll("SESSKEY", "abc123").replaceAll("USERID", "4242");

const ONETOPIC = fixture("course_onetopic.html"); // course 125833, no section param (section 0)
const SECTION = fixture("course_section.html"); // course 125833, section=1

export const COURSES = [
  { id: 125833, fullname: "CONT_26BAT-604 :: DECISION SCIENCE", shortname: "CONT_26BAT-604" },
  { id: 125900, fullname: "26BAT-604 :: DECISION SCIENCE", shortname: "26BAT-604" },
  { id: 125901, fullname: "26BAH-611 :: BUSINESS ETHICS AND CORPORATE GOVERNANCE", shortname: "26BAH-611" },
  { id: 125902, fullname: "26BAT-610 :: MARKETING MANAGEMENT", shortname: "26BAT-610" },
  { id: 999, fullname: "26XXX-000 :: EXPIRED COURSE", shortname: "26XXX-000" },
];

// Sections 2..12 of the onetopic course do not exist as captures. Derive them
// from the section=1 capture: renumber the section and give its activities
// fresh ids and names so they are distinguishable.
function sectionPage(n) {
  if (n === 1) return SECTION;
  if (n === 0) return ONETOPIC;
  let page = SECTION.replaceAll('data-number="1"', `data-number="${n}"`)
    .replaceAll('id="section-1"', `id="section-${n}"`)
    .replace(/(view\.php\?id=)(\d{7})/g, (_, p, id) => p + (Number(id) + n * 1000))
    .replace(/(data-id=")(\d{7})/g, (_, p, id) => p + (Number(id) + n * 1000))
    .replace(/(id="module-)(\d{7})/g, (_, p, id) => p + (Number(id) + n * 1000))
    .replace(/(<span class="instancename">)([^<]+)/g, (_, p, name) => `${p}${name.trim()} ${n}.x `);
  if (n === 6) {
    // An empty chapter.
    page = page.replace(/<li\s+class="activity[\s\S]*?<\/li>\s*(?=<li\s+class="activity|<\/ul>)/g, "");
  }
  if (n === 3) {
    // A slide deck that goes through CU's Office viewer, a folder, a link and a label.
    page = page.replace(
      /(<li\s+class="activity resource modtype_resource)/,
      `<li class="activity resource modtype_resource" id="module-7000001" data-for="cmitem" data-id="7000001">
         <div class="activity-item" data-activityname="Rights-based ethics; Challenges">
           <img src="https://lms.cuchd.in/theme/image.php/moove_child/core/1/f/powerpoint?filtericon=1" class="activityicon">
           <div class="activityname"><a href="https://lms.cuchd.in/mod/resource/view.php?id=7000001"><span class="instancename">Topic 3.2.5 - Rights-based ethics; Challenges <span class="accesshide"> File</span></span></a></div>
         </div></li>
       <li class="activity folder modtype_folder" id="module-7000002" data-for="cmitem" data-id="7000002">
         <div class="activityname"><a href="https://lms.cuchd.in/mod/folder/view.php?id=7000002"><span class="instancename">Previous year papers <span class="accesshide"> Folder</span></span></a></div></li>
       <li class="activity url modtype_url" id="module-7000003" data-for="cmitem" data-id="7000003">
         <div class="activityname"><a href="https://lms.cuchd.in/mod/url/view.php?id=7000003"><span class="instancename">NPTEL lecture video <span class="accesshide"> URL</span></span></a></div></li>
       <li class="activity quiz modtype_quiz" id="module-7000005" data-for="cmitem" data-id="7000005">
         <div class="activityname"><a href="https://lms.cuchd.in/mod/quiz/view.php?id=7000005"><span class="instancename">Chapter quiz <span class="accesshide"> Quiz</span></span></a></div>
         <div class="availabilityinfo">Not available unless: ...</div></li>
       <li class="activity label modtype_label" id="module-7000004" data-for="cmitem" data-id="7000004">
         <div class="activity-altcontent"><p>Read chapter 4 before the class on Monday. Slides: <a href="https://lms.cuchd.in/mod/resource/view.php?id=7000001">here</a></p></div></li>
       $1`
    );
  }
  return page;
}

// A course in the "topics" format: every section on one page, no jump menu.
const TOPICS = `<!DOCTYPE html><html><head><title>Course: 26BAT-610 :: MARKETING MANAGEMENT | CU-LMS</title>
<script>M.cfg = {"sesskey":"abc123","userId":4242,"courseId":125902};</script></head><body>
<ul class="topics">
  <li class="section course-section main" id="section-0" data-number="0" data-for="section">
    <h3 class="sectionname">General</h3>
    <ul><li class="activity resource modtype_resource" id="module-8000001" data-id="8000001">
      <img class="activityicon" src="/theme/image.php/x/core/1/f/document?filtericon=1">
      <div class="activityname"><a href="https://lms.cuchd.in/mod/resource/view.php?id=8000001"><span class="instancename">Syllabus <span class="accesshide"> File</span></span></a></div></li></ul>
  </li>
  <li class="section course-section main" id="section-1" data-number="1" data-for="section">
    <h3 class="sectionname">Week 1 — The marketing mix</h3>
    <ul><li class="activity assign modtype_assign" id="module-8000002" data-id="8000002">
      <div class="activityname"><a href="https://lms.cuchd.in/mod/assign/view.php?id=8000002"><span class="instancename">Case study 1 <span class="accesshide"> Assignment</span></span></a></div></li>
    <li class="activity resource modtype_resource" id="module-8000003" data-id="8000003">
      <img class="activityicon" src="/theme/image.php/x/core/1/f/spreadsheet?filtericon=1">
      <div class="activityname"><a href="https://lms.cuchd.in/mod/resource/view.php?id=8000003"><span class="instancename">Pricing worksheet <span class="accesshide"> File</span></span></a></div></li></ul>
  </li>
</ul></body></html>`;

const EMPTY_COURSE = (title) => `<!DOCTYPE html><html><head><title>Course: ${title} | CU-LMS</title>
<script>M.cfg = {"sesskey":"abc123","userId":4242};</script></head><body>
<div role="main"><p>No content.</p></div></body></html>`;

const VIEWER = `<!DOCTYPE html><html><head><title>Office viewer</title></head><body>
<div class="local-officeviewer-toolbar"><span class="local-officeviewer-filename">Topic 3.2.5 - Rights-based ethics; Challenges.pptx</span>
<a class="btn" download="Topic 3.2.5 - Rights-based ethics; Challenges.pptx" href="https://lms.cuchd.in/pluginfile.php/4612947/mod_resource/content/2/Topic%203.2.5%20-%20Rights-based%20ethics%3B%20Challenges.pptx?forcedownload=1">Download original file</a></div>
<iframe src="https://lms.cuchd.in/local/officeviewer/pdf.php?id=7000001&amp;h=ab"></iframe></body></html>`;

const FOLDER = `<!DOCTYPE html><html><head><title>Folder</title></head><body><div role="main">
<div class="foldertree"><ul><li><span>Previous year papers</span><ul>
<li><a href="https://lms.cuchd.in/pluginfile.php/4612947/mod_folder/content/0/2024%20End%20Sem.pdf?forcedownload=1">2024 End Sem.pdf</a></li>
<li><a href="https://lms.cuchd.in/pluginfile.php/4612947/mod_folder/content/0/2023%20End%20Sem.pdf?forcedownload=1">2023 End Sem.pdf</a></li>
</ul></li></ul></div></div></body></html>`;

const FORUM = ONETOPIC.replace(/<title>[^<]*<\/title>/, "<title>Forum: COURSE SYLLABUS | CU-LMS</title>");

const LOGIN = `<!DOCTYPE html><html><head><title>Log in | CU-LMS</title><script>M.cfg={"sesskey":"zzz","userId":0};</script></head>
<body><form><input name="username"></form></body></html>`;

const PDF_BYTES = Buffer.from("%PDF-1.4\n% mock\n" + "x".repeat(1228604 - 16));

export const log = [];

// req: { method, url (URL), headers (lower-case keys), body (string) }.
// Returns { status, headers, body }.
export function respond(req) {
  const url = req.url;
  const path = url.pathname;
  const q = url.searchParams;
  log.push(`${req.method} ${path}${url.search}`);
  const fulfill = ({ status = 200, contentType, headers = {}, body = "", json }) => {
    if (json !== undefined) {
      contentType = "application/json";
      body = JSON.stringify(json);
    }
    if (contentType) headers = { "Content-Type": contentType, ...headers };
    return { status, headers, body };
  };
  const htmlRes = (body, status = 200) =>
    fulfill({ status, contentType: "text/html; charset=utf-8", body });

  // The session cookie is HttpOnly, as Moodle's is: the extension can never
  // read it, so this only passes if its requests carry the browser's login.
  const loggedIn = /(?:^|;\s*)MoodleSession=s3cret/.test(req.headers.cookie || "");
  if (path === "/my/" || path === "/my/index.php" || path === "/my/courses.php") {
    const res = htmlRes(ONETOPIC.replace(/<title>[^<]*<\/title>/, "<title>Dashboard | CU-LMS</title>"));
    res.headers["Set-Cookie"] = "MoodleSession=s3cret; path=/; secure; HttpOnly; SameSite=Lax";
    return res;
  }
  const needsSession = path === "/lib/ajax/service.php" || path === "/course/view.php" || path.startsWith("/mod/") || path.startsWith("/pluginfile.php/") || path.startsWith("/local/");
  if (needsSession && !loggedIn) {
    if (path === "/lib/ajax/service.php") return fulfill({ json: [{ error: true, exception: { errorcode: "invalidsesskey" } }] });
    return fulfill({ status: 303, headers: { Location: "https://lms.cuchd.in/login/index.php" } });
  }
  if (path === "/login/index.php") return htmlRes(LOGIN);
  if (path === "/lib/ajax/service.php") {
    const [call] = JSON.parse(req.body);
    let data;
    if (q.get("sesskey") !== "abc123") {
      return fulfill({ json: [{ error: true, exception: { errorcode: "invalidsesskey" } }] });
    }
    if (call.methodname === "core_course_get_enrolled_courses_by_timeline_classification") {
      data = { courses: COURSES, nextoffset: COURSES.length };
    } else if (call.methodname === "core_calendar_get_action_events_by_timesort") {
      const now = Math.floor(Date.now() / 1000);
      data = {
        events: [
          { id: 1, name: "Case study 1 is due", activityname: "Case study 1", activitystr: "Assignment", course: { fullname: COURSES[3].fullname }, url: "https://lms.cuchd.in/mod/assign/view.php?id=8000002", action: { url: "https://lms.cuchd.in/mod/assign/view.php?id=8000002&action=editsubmission" }, timesort: now - 3600, overdue: true },
          { id: 2, name: "Unit 1 quiz closes", activityname: "Unit 1 quiz", activitystr: "Quiz", course: { fullname: COURSES[1].fullname }, url: "https://lms.cuchd.in/mod/quiz/view.php?id=1", timesort: now + 2 * 86400 },
        ],
      };
    } else {
      return fulfill({ json: [{ error: true, exception: { errorcode: "servicenotavailable", message: "Web service is not available" } }] });
    }
    return fulfill({ json: [{ error: false, data }] });
  }
  if (path === "/course/view.php") {
    const id = Number(q.get("id"));
    const section = q.has("section") ? Number(q.get("section")) : null;
    if (id === 999) return fulfill({ status: 303, headers: { Location: "https://lms.cuchd.in/login/index.php" } });
    if (id === 125833) return htmlRes(section === null ? ONETOPIC : sectionPage(section));
    if (id === 125902) return htmlRes(TOPICS);
    const c = COURSES.find((x) => x.id === id);
    return htmlRes(EMPTY_COURSE(c ? c.fullname : "Unknown"));
  }
  if (path === "/mod/resource/view.php") {
    const id = Number(q.get("id"));
    if (id === 7000001) return fulfill({ status: 303, headers: { Location: "https://lms.cuchd.in/local/officeviewer/view.php?id=7000001" } });
    return fulfill({ status: 303, headers: { Location: `https://lms.cuchd.in/pluginfile.php/4612947/mod_resource/content/1/E-BOOK-${id}.pdf` } });
  }
  if (path === "/local/officeviewer/view.php") return htmlRes(VIEWER);
  if (path === "/mod/folder/view.php") return htmlRes(FOLDER);
  if (path.startsWith("/mod/")) return htmlRes(FORUM);
  if (path.startsWith("/pluginfile.php/")) {
    const name = decodeURIComponent(path.split("/").pop());
    const disp = `inline; filename="${name}"`;
    const type = name.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const range = req.headers["range"];
    if (range === "bytes=0-0") {
      return fulfill({ status: 206, headers: { "Content-Type": type, "Content-Range": `bytes 0-0/${PDF_BYTES.length}`, "Content-Disposition": disp }, body: PDF_BYTES.subarray(0, 1) });
    }
    return fulfill({ status: 200, headers: { "Content-Type": type, "Content-Disposition": q.get("forcedownload") ? `attachment; filename="${name}"` : disp }, body: PDF_BYTES });
  }
  if (path.startsWith("/theme/styles.php") || path.startsWith("/theme/yui_combo.php")) {
    // If Moodle's stylesheet survived the takeover, this makes it obvious.
    return fulfill({ status: 200, contentType: "text/css", body: "body{background:#ff0000 !important;font-family:serif !important}" });
  }
  if (path.endsWith(".js") || path.includes("/javascript.php") || path.includes("requirejs.php")) {
    return fulfill({ status: 200, contentType: "application/javascript", body: "" });
  }
  return fulfill({ status: 404, body: "" });
}
