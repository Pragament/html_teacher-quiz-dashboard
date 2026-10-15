# Teacher Quiz Dashboard

Independent responsive app for teachers to sign in with Google, manage quiz sessions they created, and inspect detailed quiz submissions for students in each quiz session.

## Files

- `index.html` - login, quiz session list, submission dashboard, and answer-detail modal.
- `styles.css` - responsive phone, tablet, and desktop layout.
- `app.js` - Firebase Auth, quiz session and question-list queries, quiz session creation/updates, submission queries, detail rendering, and CSV export.
- `school-admin/` - independent admin app for class section CRUD and CSV import/export.
- `FIRESTORE_SCHEMA.md` - schema and query documentation.
- `firestore.rules` - combined teacher/admin and student app security rules.

## Flow

1. Teacher signs in with Google through Firebase Auth.
2. App queries `classrooms where creatorId == teacher.uid`.
3. App queries `qb_lists_v1 where ownerUid == teacher.uid` for optional quiz session question-list assignment.
4. App loads `qb_taxonomy_v1` class, subject, and chapter nodes for optional quiz session tagging.
5. Teacher can view sections they are listed on as `admin` or `viewer`, and open a section roster from `classSections/{sectionId}/students`.
6. Section admins can also see all quiz sessions attached to that class section.
7. Teacher can create a quiz session with name, session code, class section dropdown, enabled state, optional question list, and optional class/subject/chapter taxonomy IDs.
8. Teacher selects or edits one of their quiz sessions.
9. App loads matching `qb_quiz_submissions_v1` records using:
   - `classroomId == classroom.id`
   - `classroomId == classroom.classCode` when different
10. Submissions are de-duplicated, sorted newest first, and shown in a table by default with a card-view switch.
11. Teacher can filter by student, subject, chapter, and result type.
12. Teacher can open a detailed submission review with per-question answers, correct answers, score state, and manual-review markers.
13. Teacher can choose CSV fields, optionally include per-question responses, and export the filtered submission list.
14. Teachers can use the guided tour to walk through login, quiz session creation, question-list selection, and sharing the session code.

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
- Ensure `qb_taxonomy_v1` contains class, subject, and chapter nodes if quiz sessions should be tagged by taxonomy.
- Ensure quiz submissions include `classroomId` and `sectionId`.
- Review and adapt `firestore.rules` before production use.

## Notes

- Short-answer items are shown as manual review because student quiz submissions store `isCorrect: null`.
- FIB and short-answer AI review marks/reasons are saved to `answers[].aiReview` on the submission document.
- FIB and short-answer AI review uses the Gemini Interactions API with `models/gemini-3.6-flash`.
- CSV export field selections are saved in browser `localStorage` for the next export.
- Guided tour refresh prompts can be disabled, and that preference is saved in browser `localStorage`.
- The dashboard creates and updates owned `classrooms`, reads private `qb_lists_v1`, reads `qb_quiz_submissions_v1`, and narrowly updates submission AI-review fields.
- Quiz session taxonomy selections are saved on `classrooms` as IDs only: `classId`, `subjectId`, and `chapterId`. Labels remain in `qb_taxonomy_v1`.
- For tighter production security, include `teacherUid` or `creatorId` in every submission at write time so Firestore rules can authorize teacher reads without relying on fallback client queries.

## Firestore permission errors after changing rules

The teacher dashboard checks session codes using an owner-scoped classroom query, plus any loaded section sessions. A query constrained only by `classCode` is denied because it could read other teachers' private sessions. Deploy the updated `app.js` to fix “Unable to verify session code” when saving; this fix does not require broader read permissions or a new index. This client check does not guarantee global uniqueness across teachers or concurrent saves; that requires a trusted server-side reservation system.

The student-only rules must be merged with teacher/admin rules. Replacing the project's rules with the student snippet removes teacher access to owned classrooms, question lists, sections, rosters, and submissions.

This repository's `firestore.rules` combines both sets of permissions. Publish its contents in Firebase Console → Firestore Database → Rules for the same project configured in `app.js`, then reload the dashboard. Editing this file or publishing the static website does not deploy Firestore rules. Preserve any additional rules used by other apps in that Firebase project before publishing.

Taxonomy reads are allowed for signed-in users because both apps use shared class/subject/chapter labels. Question reads retain the supplied student-only, published-question policy; any existing question-bank editor or teacher question-metadata permissions must also be retained from the project's deployed rules.

For student queries, Firestore rules are not filters: classroom list queries must constrain `sectionId` to the student's profile section; question queries must constrain `status == 'published'`; submission queries must constrain `studentKey` to the student's profile key. The student's `studentProfiles/{uid}` document must have `active: true` and matching `authUid`. A class-code-only classroom query will be denied by the student policy, even if the matching classroom belongs to that student's section.
