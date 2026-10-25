// Talks to lms.cuchd.in and nothing else. Every request is same-origin from the
// page the user is already logged in on, so it rides the existing
// MoodleSession cookie: no credentials are stored and no other server is used.
(() => {
  const CULMS = (globalThis.CULMS = globalThis.CULMS || {});
  const P = CULMS.parse;

  class SessionExpired extends Error {}

  // Content-Disposition filenames run to the closing quote, not the first
  // semicolon (CU uploads "Topic 3.2.5 - Rights-based ethics; Challenges.pptx").
  const FILENAME = /filename\*?=(?:UTF-8'')?(?:"([^"]+)"|([^;]+))/i;
  const CONTENT_RANGE = /bytes\s+\d+-\d+\/(\d+)/;

  function check(r, what) {
    if (P.isLoginPage(r.url)) throw new SessionExpired(`redirected to login ${what}`);
    if (!r.ok) throw new Error(`${what}: HTTP ${r.status}`);
  }

  async function page(url, what) {
    const r = await fetch(url, { credentials: "same-origin" });
    check(r, what);
    return { doc: P.toDoc(await r.text()), url: r.url };
  }

  class Lms {
    constructor(sesskey) {
      this.sesskey = sesskey;
    }

    async ajax(methodname, args) {
      const url = `/lib/ajax/service.php?sesskey=${encodeURIComponent(this.sesskey)}&info=${methodname}`;
      const r = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ index: 0, methodname, args }]),
      });
      check(r, `calling ${methodname}`);
      const payload = (await r.json())[0];
      if (payload.error) {
        const code = (payload.exception && payload.exception.errorcode) || "";
        if (/login|sesskey/.test(code)) throw new SessionExpired(`${methodname}: ${code}`);
        throw new Error(`${methodname}: ${(payload.exception && payload.exception.message) || code}`);
      }
      return payload.data;
    }

    async courses() {
      const data = await this.ajax("core_course_get_enrolled_courses_by_timeline_classification", {
        offset: 0,
        limit: 0,
        classification: "all",
        sort: "fullname",
      });
      return data.courses.map((c) => ({ id: c.id, fullname: c.fullname, shortname: c.shortname, ...cleanName(c.fullname) }));
    }

    async upcoming() {
      const now = Math.floor(Date.now() / 1000);
      const data = await this.ajax("core_calendar_get_action_events_by_timesort", {
        limitnum: 15,
        timesortfrom: now - 86400,
        timesortto: now + 30 * 86400,
        limittononsuspendedevents: true,
      });
      return (data.events || []).map((e) => ({
        id: e.id,
        name: e.activityname || e.name,
        what: e.activitystr || e.modulename || "",
        course: e.course ? cleanName(e.course.fullname).title : "",
        url: (e.action && e.action.url) || e.url,
        time: e.timesort * 1000,
        overdue: !!e.overdue,
      }));
    }

    // One month as Moodle's calendar draws it: weeks of days, each with its
    // events, padded to whole weeks.
    async month(year, month) {
      const data = await this.ajax("core_calendar_get_calendar_monthly_view", {
        year,
        month,
        courseid: 1,
        categoryid: 0,
        includenavigation: false,
        mini: false,
        day: 1,
      });
      return {
        name: data.periodname || "",
        daynames: (data.daynames || []).map((d) => d.shortname),
        weeks: (data.weeks || []).map((w) => ({
          pre: (w.prepadding || []).length,
          post: (w.postpadding || []).length,
          days: w.days.map((d) => ({
            mday: d.mday,
            time: d.timestamp * 1000,
            today: !!d.istoday,
            weekend: !!d.isweekend,
            events: (d.events || []).map((e) => ({
              id: e.id,
              name: e.name,
              what: e.activitystr || e.normalisedeventtypetext || "",
              type: e.eventtype || "",
              course: e.course ? cleanName(e.course.fullname).title : "",
              url: e.url || e.viewurl || "",
              time: e.timestart * 1000,
            })),
          })),
        })),
      };
    }

    async courseHtml(courseId, section) {
      const q = section === undefined || section === null ? "" : `&section=${section}`;
      return page(`/course/view.php?id=${courseId}${q}`, `loading course ${courseId}`);
    }

    async folder(cmid) {
      const { doc } = await page(`/mod/folder/view.php?id=${cmid}`, `opening folder ${cmid}`);
      return P.folderFiles(doc);
    }

    // Where a quiz or assignment stands for this student, read off its page.
    async status(it) {
      const { doc } = await page(`/mod/${it.modname}/view.php?id=${it.cmid}`, `opening ${it.name}`);
      return it.modname === "quiz" ? P.quizStatus(doc) : P.assignStatus(doc);
    }

    // A Page, or a whole Book through its print view, for parse.contentMarkdown
    // and parse.contentFiles.
    async content(it) {
      const url = it.modname === "book" ? `/mod/book/tool/print/index.php?id=${it.cmid}` : `/mod/${it.modname}/view.php?id=${it.cmid}`;
      return (await page(url, `opening ${it.name}`)).doc;
    }

    async bytes(url) {
      const r = await fetch(url, { credentials: "same-origin" });
      check(r, "downloading a file");
      return new Uint8Array(await r.arrayBuffer());
    }

    // Follow a File activity to the real file without downloading it: a
    // one-byte range request yields name and total size (same trick as the
    // connector, since pluginfile.php does not reliably send Content-Length).
    async resolveFile(cmid) {
      const probe = (url) =>
        fetch(url, { credentials: "same-origin", headers: { Range: "bytes=0-0" } });
      let r = await probe(`/mod/resource/view.php?id=${cmid}&redirect=1`);
      check(r, `opening file ${cmid}`);
      if ((r.headers.get("Content-Type") || "").includes("text/html")) {
        // Office documents land on CU's viewer page. A 206 page is cut to one
        // byte and has no link left in it, so fetch it whole in that case.
        const html = r.status === 206 ? await (await fetch(r.url, { credentials: "same-origin" })).text() : await r.text();
        const url = P.viewerDownloadUrl(P.toDoc(html));
        if (!url) throw new Error("This file is not available (the course may be hidden).");
        r = await probe(url);
        check(r, `opening file ${cmid}`);
      }
      let size = null;
      const range = CONTENT_RANGE.exec(r.headers.get("Content-Range") || "");
      if (range) size = Number(range[1]);
      else if (r.status === 200 && r.headers.get("Content-Length")) size = Number(r.headers.get("Content-Length"));
      const m = FILENAME.exec(r.headers.get("Content-Disposition") || "");
      const raw = m ? m[1] || m[2] : new URL(r.url).pathname.split("/").pop();
      let filename = raw;
      try {
        filename = decodeURIComponent(raw);
      } catch {}
      if (r.body) r.body.cancel().catch(() => {});
      return { url: r.url, filename: filename.trim(), size };
    }
  }

  // "26BAT-604 :: DECISION SCIENCE" -> title + code; CONT_ shells flagged.
  function cleanName(fullname) {
    if (!fullname.includes(" :: ")) return { title: fullname.trim(), code: "", isCont: false };
    const i = fullname.indexOf(" :: ");
    const code = fullname.slice(0, i).trim();
    return { title: fullname.slice(i + 4).trim(), code, isCont: code.toUpperCase().startsWith("CONT_") };
  }

  // The subject a course belongs to: "26BAT-604_26MBA-109_ALL" (the class) and
  // "CONT_26BAT-604" (CU's content course) are both "26BAT-604".
  function subjectKey(code) {
    return code.replace(/^CONT_/i, "").split("_")[0].toUpperCase();
  }

  function withParam(url, key, value) {
    const u = new URL(url, location.href);
    u.searchParams.set(key, value);
    return u.href;
  }

  CULMS.Lms = Lms;
  CULMS.SessionExpired = SessionExpired;
  CULMS.cleanName = cleanName;
  CULMS.subjectKey = subjectKey;
  CULMS.withParam = withParam;
})();
