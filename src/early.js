// Runs at document_start, before Moodle paints anything. Its only job is to
// hide the page on the routes the simple view will take over, so the user sees
// a short "loading" card instead of the full Moodle dashboard flashing past.
// Everything else waits for the page to finish loading (app.js).
(() => {
  const CULMS = (globalThis.CULMS = globalThis.CULMS || {});

  CULMS.MODE_KEY = "culms-simple:mode";

  CULMS.enabled = () => {
    try {
      return localStorage.getItem(CULMS.MODE_KEY) !== "off";
    } catch {
      return true;
    }
  };

  // Which simple view a URL maps to, or null when the original page should be
  // left alone (activities, quizzes, assignments, the login page, ...).
  CULMS.route = (loc) => {
    const path = loc.pathname.replace(/\/+$/, "/");
    if (path === "/" || path === "/my/" || path === "/my/index.php" || path === "/my/courses.php") {
      return { name: "home" };
    }
    if (path === "/course/view.php") {
      const params = new URLSearchParams(loc.search);
      const id = Number(params.get("id"));
      if (id > 0) {
        const section = params.get("section");
        return { name: "course", id, section: section === null ? null : Number(section) };
      }
    }
    if (path === "/calendar/view.php") {
      const time = Number(new URLSearchParams(loc.search).get("time"));
      return { name: "calendar", time: time > 0 ? time : null };
    }
    return null;
  };

  if (!CULMS.enabled() || !CULMS.route(location)) return;

  const html = document.documentElement;
  html.classList.add("culms-pending");
  // If app.js never gets to run (an exception, a page that never finishes),
  // the original site must come back rather than stay blank.
  setTimeout(() => html.classList.remove("culms-pending"), 15000);
})();
