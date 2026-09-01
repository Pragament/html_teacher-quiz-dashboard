# Teacher Quiz Dashboard

Independent responsive app for teachers to sign in with Google, view classrooms they created, and inspect detailed quiz submissions for students in each classroom.

## Files

- `index.html` - login, classroom list, submission dashboard, and answer-detail modal.
- `styles.css` - responsive phone, tablet, and desktop layout.
- `app.js` - Firebase Auth, classroom queries, submission queries, detail rendering, and CSV export.
- `FIRESTORE_SCHEMA.md` - schema and query documentation.
- `firestore.rules` - starter security rules notes for teacher dashboard access.

## Flow

1. Teacher signs in with Google through Firebase Auth.
2. App queries `classrooms where creatorId == teacher.uid`.
3. Teacher selects one of their classrooms.
4. App loads matching `qb_quiz_submissions_v1` records using:
   - `classroomId == classroom.id`
   - `classroomId == classroom.classCode` when different
   - `sectionId == classroom.sectionId`
5. Submissions are de-duplicated, sorted newest first, and shown with summary statistics.
6. Teacher can filter by student, subject, chapter, and result type.
7. Teacher can open a detailed submission review with per-question answers, correct answers, score state, and manual-review markers.
8. Teacher can export the filtered submission list as CSV.

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
- Ensure quiz submissions include `classroomId` and `sectionId`.
- Review and adapt `firestore.rules` before production use.

## Notes

- Short-answer items are shown as manual review because student quiz submissions store `isCorrect: null`.
- The dashboard reads existing `classrooms` and `qb_quiz_submissions_v1` data. It does not create or modify classrooms/submissions.
- For tighter production security, include `teacherUid` or `creatorId` in every submission at write time so Firestore rules can authorize teacher reads without relying on fallback client queries.
