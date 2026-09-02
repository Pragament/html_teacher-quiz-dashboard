# Teacher Quiz Dashboard

Independent responsive app for teachers to sign in with Google, manage classrooms they created, and inspect detailed quiz submissions for students in each classroom.

## Files

- `index.html` - login, classroom list, submission dashboard, and answer-detail modal.
- `styles.css` - responsive phone, tablet, and desktop layout.
- `app.js` - Firebase Auth, classroom and question-list queries, classroom updates, submission queries, detail rendering, and CSV export.
- `FIRESTORE_SCHEMA.md` - schema and query documentation.
- `firestore.rules` - starter security rules notes for teacher dashboard access.

## Flow

1. Teacher signs in with Google through Firebase Auth.
2. App queries `classrooms where creatorId == teacher.uid`.
3. App queries `qb_lists_v1 where ownerUid == teacher.uid` for optional classroom question-list assignment.
4. Teacher selects one of their classrooms.
5. Teacher can edit classroom name, code, section name, enabled state, and optional question list.
6. App loads matching `qb_quiz_submissions_v1` records using:
   - `classroomId == classroom.id`
   - `classroomId == classroom.classCode` when different
   - `sectionId == classroom.sectionId`
7. Submissions are de-duplicated, sorted newest first, and shown with summary statistics.
8. Teacher can filter by student, subject, chapter, and result type.
9. Teacher can open a detailed submission review with per-question answers, correct answers, score state, and manual-review markers.
10. Teacher can export the filtered submission list as CSV.

## Run Locally

From the repository root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/teacher-quiz-dashboard/
```

The app loads Firebase, KaTeX, and Mermaid from CDNs.

## Firebase Setup

- Enable Google as a Firebase Auth provider.
- Add the serving domain to Firebase Auth authorized domains.
- Ensure classroom documents store the teacher UID in `creatorId`.
- Ensure private question lists store the teacher UID in `ownerUid`.
- Ensure quiz submissions include `classroomId` and `sectionId`.
- Review and adapt `firestore.rules` before production use.

## Notes

- Short-answer items are shown as manual review because student quiz submissions store `isCorrect: null`.
- The dashboard updates owned `classrooms`, reads private `qb_lists_v1`, and reads `qb_quiz_submissions_v1`. It does not create classrooms or modify submissions.
- For tighter production security, include `teacherUid` or `creatorId` in every submission at write time so Firestore rules can authorize teacher reads without relying on fallback client queries.
