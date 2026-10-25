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
      <div class="activityname"><a href="https://lms.cuchd.in/mod/resource/view.php?id=8000003"><span class="instancename">Pricing worksheet <span class="accesshide"> File</span></span></a></div></li>
    <li class="activity page modtype_page" id="module-8000004" data-id="8000004">
      <div class="activityname"><a href="https://lms.cuchd.in/mod/page/view.php?id=8000004"><span class="instancename">Reading notes <span class="accesshide"> Page</span></span></a></div></li></ul>
  </li>
</ul></body></html>`;

// The class course of DECISION SCIENCE: CU keeps assessments and live links
// here, and the units in the CONT_ course. The two are shown as one subject.
// Quiz and assignment markup (dates, completion) is as the live course page
// draws it; their own pages are ACTIVITY_PAGES below.
const DAY = 86400000;
// "Saturday, 12 September 2026, 11:47 AM", as Moodle prints dates.
function moodleDate(ms) {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^(\w+) /, "$1, ");
  return `${day}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}
const dates = (...rows) => `<div data-region="activity-dates" class="activity-dates">${rows
  .map(([label, ms]) => `<div><strong>${label}:</strong> ${moodleDate(ms)}</div>`).join("")}</div>`;
const completion = (state) => `<div class="activity-completion"><div data-region="activity-information" class="activity-information"><div data-region="completion-info">
  <div data-region="completionrequirements"><div class="dropdown completion-dropdown"><button class="btn dropdown-toggle" type="button">
  <i class="icon fa fa-check"></i> ${state} </button></div></div></div></div></div>`;
const activity = (mod, id, name, extra = "") => `<li class="activity ${mod} modtype_${mod}" id="module-${id}" data-id="${id}">
  <div class="activityname"><a href="https://lms.cuchd.in/mod/${mod}/view.php?id=${id}"><span class="instancename">${name} <span class="accesshide"> ${mod}</span></span></a></div>${extra}</li>`;

function classCourse() {
  const now = Date.now();
  return `<!DOCTYPE html><html><head><title>Course: 26BAT-604 :: DECISION SCIENCE | CU-LMS</title>
<script>M.cfg = {"sesskey":"abc123","userId":4242,"courseId":125900};</script></head><body>
<ul class="topics">
  <li class="section course-section main" id="section-0" data-number="0" data-for="section">
    <h3 class="sectionname">Live Session Links</h3>
    <ul>${activity("url", 9000001, "Monday live class")}</ul>
  </li>
  <li class="section course-section main" id="section-1" data-number="1" data-for="section">
    <h3 class="sectionname">Quiz</h3>
    <ul>${activity("quiz", 9000002, "Quiz 1", dates(["Opened", now - 30 * DAY], ["Closed", now - 3 * DAY]) + completion("Done"))}
    ${activity("quiz", 9000006, "Quiz 2", dates(["Opens", now + 5 * DAY], ["Closes", now + 6 * DAY]))}
    <li class="activity resource modtype_resource" id="module-9000003" data-id="9000003">
      <img class="activityicon" src="/theme/image.php/x/core/1/f/pdf?filtericon=1">
      <div class="activityname"><a href="https://lms.cuchd.in/mod/resource/view.php?id=9000003"><span class="instancename">Assessment model <span class="accesshide"> File</span></span></a></div></li></ul>
  </li>
  <li class="section course-section main" id="section-2" data-number="2" data-for="section">
    <h3 class="sectionname">Unit-1</h3>
    <ul>${activity("assign", 9000004, "Assignment 1", dates(["Opened", now - 20 * DAY], ["Due", now + 7 * DAY]))}
    ${activity("assign", 9000005, "Assignment 2", dates(["Opened", now - 20 * DAY], ["Due", now - 2 * DAY]))}</ul>
  </li>
  <li class="section course-section main" id="section-3" data-number="3" data-for="section">
    <h3 class="sectionname">Surprise Test</h3>
    <ul>${activity("assign", 9000007, "Surprise Test", completion("To do"))}</ul>
  </li>
</ul></body></html>`;
}

const assignPage = (status, grade) => `<!DOCTYPE html><html><head><title>Assignment | CU-LMS</title></head><body><div role="main">
<div class="submissionstatustable"><table class="generaltable"><tbody>
<tr><th>Submission status</th><td>${status}</td></tr>
<tr><th>Grading status</th><td>${grade ? "Graded" : "Not graded"}</td></tr>
<tr><th>Last modified</th><td>-</td></tr></tbody></table></div>
${grade ? `<div class="feedback"><table class="generaltable"><tr><th>Grade</th><td>${grade}</td></tr></table></div>` : ""}
</div></body></html>`;

// CU's theme draws past attempts as cards, not Moodle's table.
const quizPage = (attempted) => `<!DOCTYPE html><html><head><title>Quiz | CU-LMS</title></head><body><div role="main">
<div class="box py-3">Attempts allowed: 1Time limit: 10 mins</div>
${attempted ? `<h3>Your attempts</h3><div class="moove-attempts-list"><div class="rounded border p-3"><h4>Attempt 1</h4>
<div class="moove-summary-table quizreviewsummary"><div class="moove-info-container">
<div class="moove-infobox"><h5 class="moove-infobox-title">Status</h5><div class="moove-infobox-content--small">Finished</div></div>
<div class="moove-infobox"><h5 class="moove-infobox-title">Started</h5><div class="moove-infobox-content--small">Monday, 28 September 2026, 2:33 PM</div></div>
</div></div></div></div><div id="feedback"><h3>Highest grade: 8.00 / 10.00.</h3></div>` : `<button class="btn btn-primary">Attempt quiz</button>`}
</div></body></html>`;

const ACTIVITY_PAGES = {
  "/mod/assign/view.php?id=9000004": assignPage("Submitted for grading"),
  "/mod/assign/view.php?id=9000005": assignPage("No submissions have been made yet"),
  "/mod/assign/view.php?id=9000007": assignPage("No submissions have been made yet"),
  "/mod/quiz/view.php?id=9000002": quizPage(true),
  "/mod/quiz/view.php?id=9000006": quizPage(false),
};

// A Page activity as CU writes them: notes, a scoped <style>, an embedded
// YouTube lecture, reading links, and a handout and a diagram uploaded into
// the page itself.
const PAGE = `<!DOCTYPE html><html><head><title>Page | CU-LMS</title></head><body><div role="main">
<h2>Reading notes</h2><div class="box py-3 generalbox center clearfix"><div class="no-overflow">
<style>.ailb-lp{max-width:100%}</style><div class="ailb-lp"><h3>The 4 Ps</h3><p>Product, price, place and promotion.</p>
<ul><li>Product decisions</li><li>Pricing strategy</li></ul>
<iframe src="https://www.youtube.com/embed/qc7h69onKP0"></iframe>
<p><img src="https://lms.cuchd.in/pluginfile.php/4700001/mod_page/content/3/4ps.png" alt="The 4 Ps diagram"></p>
<p>Handout: <a href="https://lms.cuchd.in/pluginfile.php/4700001/mod_page/content/3/Marketing%20mix%20handout.pdf">Marketing mix handout</a></p>
<p>Further reading: <a href="https://openlibrary.org/search?q=marketing">Open Library</a></p></div></div></div></div></body></html>`;

// core_calendar_get_calendar_monthly_view, shaped like the live answer:
// Monday-first weeks padded to whole weeks, events on their day.
function monthView(year, month) {
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  const today = new Date();
  const weeks = [];
  let week = { prepadding: Array.from({ length: (first.getDay() + 6) % 7 }, (_, i) => i), postpadding: [], days: [] };
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    const ts = Math.floor(date.getTime() / 1000);
    const events = [];
    const ev = (id, name, eventtype, modulename, course, hour) => ({
      id, name, eventtype, modulename, activitystr: `${modulename === "quiz" ? "Quiz" : "Assignment"} ${eventtype === "open" ? "opens" : eventtype === "due" ? "is due" : "closes"}`,
      course: { fullname: course }, url: `https://lms.cuchd.in/mod/${modulename}/view.php?id=${id}`, timestart: ts + hour * 3600, timeduration: 0,
    });
    if (d === 4) events.push(ev(101, "UNIT-2-QUIZ opens", "open", "quiz", "26BAT-604 :: DECISION SCIENCE", 10));
    if (d === 16) {
      events.push(ev(102, "QUIZ 2 opens", "open", "quiz", COURSES[3].fullname, 9));
      events.push(ev(103, "QUIZ 2 closes", "close", "quiz", COURSES[3].fullname, 10));
      events.push(ev(104, "Case study 1 is due", "due", "assign", COURSES[3].fullname, 18));
      events.push(ev(105, "Reflection is due", "due", "assign", COURSES[2].fullname, 23));
    }
    week.days.push({ mday: d, timestamp: ts, istoday: date.toDateString() === today.toDateString(), isweekend: date.getDay() % 6 === 0, events });
    if (date.getDay() === 0 || d === days) {
      if (d === days) week.postpadding = Array.from({ length: 7 - week.prepadding.length - week.days.length }, (_, i) => i);
      weeks.push(week);
      week = { prepadding: [], postpadding: [], days: [] };
    }
  }
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return { periodname: first.toLocaleString("en", { month: "long", year: "numeric" }), daynames: names.map((shortname) => ({ shortname })), weeks };
}

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
  const needsSession = path === "/lib/ajax/service.php" || path === "/course/view.php" || path === "/calendar/view.php" || path.startsWith("/mod/") || path.startsWith("/pluginfile.php/") || path.startsWith("/local/");
  if (needsSession && !loggedIn) {
    if (path === "/lib/ajax/service.php") return fulfill({ json: [{ error: true, exception: { errorcode: "invalidsesskey" } }] });
    return fulfill({ status: 303, headers: { Location: "https://lms.cuchd.in/login/index.php" } });
  }
  if (path === "/login/index.php") return htmlRes(LOGIN);
  if (path === "/calendar/view.php") return htmlRes(EMPTY_COURSE("Calendar").replace("Course: ", ""));
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
    } else if (call.methodname === "core_calendar_get_calendar_monthly_view") {
      data = monthView(call.args.year, call.args.month);
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
    if (id === 125900) return htmlRes(classCourse());
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
  if (ACTIVITY_PAGES[path + url.search]) return htmlRes(ACTIVITY_PAGES[path + url.search]);
  if (path === "/mod/page/view.php") return htmlRes(PAGE);
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
