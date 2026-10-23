# Chrome Web Store listing

Everything the developer dashboard asks for, ready to paste. Build the upload
with `npm run package` (writes `dist/culms-simple.zip` from the last commit)
and the images with `npm run store-images` (writes `store/`).

## Package

- Upload: `dist/culms-simple.zip`
- Permissions requested: none. The only host access is the content script on
  `https://lms.cuchd.in/*`.

## Store listing tab

- **Name:** CULMS Simple (from the manifest)
- **Summary:** taken from the manifest description.
- **Category:** Education
- **Language:** English
- **Icon:** `icons/icon128.png`
- **Screenshots (1280x800):** `store/1-dashboard.png`,
  `store/2-course-assessments.png`, `store/3-course-units.png`,
  `store/4-calendar.png`, `store/5-search-dark.png`
- **Small promo tile (440x280):** `store/promo-440x280.png`
- **Homepage / support URL:** https://github.com/SurajBhari/culms_extension

**Description:**

```
An unofficial, cleaner view of the Chandigarh University LMS (lms.cuchd.in).

CULMS Simple replaces the LMS dashboard and course pages with a plain list:
your courses, their units and chapters, and every file in them, on one page.

• Every subject in one place: the class course and its CONT content course
  are shown together.
• Assessments: surprise tests, quizzes and assignments with their deadlines
  and where you stand (submitted, attempted, not attempted, missed).
• Calendar: a month view of every quiz and assignment, with a list of the
  month's deadlines.
• Downloads: files open or download directly, past the Office viewer. Download
  a whole course or one unit as a single .zip, with the topic notes as text,
  ready to give to an AI tool as context.
• Search across every course you have opened.
• Dark mode and phone-width layouts.

Private by design: it only talks to lms.cuchd.in with the session you are
already logged in with. No server, no analytics, no tracking. It never sees
your password and never posts or submits anything.

Not affiliated with Chandigarh University. Switch back to the original site
at any time with the "Original site" link.
```

## Privacy practices tab

- **Single purpose:**
  `Shows the Chandigarh University LMS (lms.cuchd.in) as a simpler list of the
  student's courses, files, deadlines and calendar.`
- **Host permission justification (lms.cuchd.in):**
  `The extension's only job is to redraw pages of lms.cuchd.in. It reads the
  page the student is on and fetches their own course pages from the same site
  to build the simplified view.`
- **Remote code:** No, I am not using remote code.
- **Data usage:** tick **Personally identifiable information** (the student's
  name, shown as a greeting) and **Website content** (course pages and
  files). Nothing is sent off the device, but Google counts data the
  extension handles, not only data it sends.
- Tick all three certifications (no selling, no unrelated use, no
  creditworthiness use).
- **Privacy policy URL:**
  https://github.com/SurajBhari/culms_extension/blob/main/PRIVACY.md

## Distribution tab

- **Visibility:** Public, or Unlisted to share the link with classmates first.
- **Regions:** All regions (or India only).
