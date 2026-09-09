# Teacher Quiz Dashboard

Independent responsive app for teachers to sign in with Google, manage quiz sessions they created, and inspect detailed quiz submissions for students in each quiz session.

## Files

- `index.html` - login, quiz session list, submission dashboard, and answer-detail modal.
- `styles.css` - responsive phone, tablet, and desktop layout.
- `app.js` - Firebase Auth, quiz session and question-list queries, quiz session creation/updates, submission queries, detail rendering, and CSV export.
- `school-admin/` - independent admin app for class section CRUD and CSV import/export.
- `FIRESTORE_SCHEMA.md` - schema and query documentation.
- `firestore.rules` - starter security rules notes for teacher dashboard access.

## Flow

1. Teacher signs in with Google through Firebase Auth.
2. App queries `classrooms where creatorId == teacher.uid`.
3. App queries `qb_lists_v1 where ownerUid == teacher.uid` for optional quiz session question-list assignment.
4. Teacher can view sections they are listed on as `admin` or `viewer`, and open a section roster from `classSections/{sectionId}/students`.
5. Section admins can also see all quiz sessions attached to that class section.
6. Teacher can create a quiz session with name, session code, class section dropdown, enabled state, and optional question list.
7. Teacher selects or edits one of their quiz sessions.
8. App loads matching `qb_quiz_submissions_v1` records using:
   - `classroomId == classroom.id`
   - `classroomId == classroom.classCode` when different
   - `sectionId == classroom.sectionId`
9. Submissions are de-duplicated, sorted newest first, and shown in a table by default with a card-view switch.
10. Teacher can filter by student, subject, chapter, and result type.
11. Teacher can open a detailed submission review with per-question answers, correct answers, score state, and manual-review markers.
12. Teacher can choose CSV fields, optionally include per-question responses, and export the filtered submission list.
13. Teachers can use the guided tour to walk through login, quiz session creation, question-list selection, and sharing the session code.

## Run Locally

From the repository root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/teacher-quiz-dashboard/
```

The app loads Firebase, KaTeX, Mermaid, and Intro.js from CDNs.

## Firebase Setup

- Enable Google as a Firebase Auth provider.
- Add the serving domain to Firebase Auth authorized domains.
- Ensure classroom documents store the teacher UID in `creatorId`.
- Ensure class section documents include lowercase member emails in `members` with `admin` or `viewer` roles.
- Ensure private question lists store the teacher UID in `ownerUid`.
- Ensure quiz submissions include `classroomId` and `sectionId`.
- Review and adapt `firestore.rules` before production use.

## Notes

- Short-answer items are shown as manual review because student quiz submissions store `isCorrect: null`.
- FIB and short-answer AI review marks/reasons are saved to `answers[].aiReview` on the submission document.
- FIB and short-answer AI review uses the Gemini Interactions API with `models/gemini-3.6-flash`.
- CSV export field selections are saved in browser `localStorage` for the next export.
- Guided tour refresh prompts can be disabled, and that preference is saved in browser `localStorage`.
- The dashboard creates and updates owned `classrooms`, reads private `qb_lists_v1`, reads `qb_quiz_submissions_v1`, and narrowly updates submission AI-review fields.
- For tighter production security, include `teacherUid` or `creatorId` in every submission at write time so Firestore rules can authorize teacher reads without relying on fallback client queries.
