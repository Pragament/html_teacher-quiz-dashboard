# Firestore Schema

The teacher dashboard reads classroom and quiz submission data. It can create and update classrooms owned by the signed-in teacher.

## Firebase Auth

Teachers sign in with Google. The app uses the signed-in Firebase Auth UID to find classrooms:

```txt
classrooms where creatorId == currentUser.uid
```

## Collections

### `classrooms`

Path:

```txt
/classrooms/{classroomId}
```

Document shape:

```js
{
  classCode: '176260',
  classEnabled: true,
  className: 'DSS grade 8 aug 31 quiz',
  createdBy: '',
  createdAt: Timestamp,
  createdDate: 1788177950135,
  creatorId: 'SPwA523UClVxTpX5m8XPMu5Imiy1',
  sectionId: 'QQAP9O4UyvlaYhqz7jdE',
  sectionName: 'DSS grade 8',
  questionBankListId: 'qb_lists_v1 document id',
  classId: 'class_ix',
  subjectId: 'class_ix__subject_mathematics',
  chapterId: 'class_ix__subject_mathematics__chapter_algebra',
  randomQuestionTypeCounts: {
    mcq: 10,
    fib: 5,
    short_answer: 3,
    true_false: 2
  },
  studentDifficultyLevels: {
    '102': 'Easy',
    '103': 'Hard'
  },
  studentDifficultyUpdatedAt: Timestamp,
  archived: false,
  archivedAt: Timestamp,
  archivedBy: 'firebase-auth-uid',
  updatedAt: Timestamp
}
```

Important fields:

- `creatorId` - must match the signed-in teacher UID for the classroom to appear.
- `classCode` - shown in classroom cards and used as a submission lookup fallback.
- `classEnabled` - shown as enabled/disabled.
- `sectionId` - links the quiz session to a class section.
- `sectionName` - shown in the dashboard.
- `questionBankListId` - optional reference to a private question list selected by the teacher.
- `classId` - optional `qb_taxonomy_v1` class node ID selected in the quiz session form.
- `subjectId` - optional `qb_taxonomy_v1` subject node ID selected in the quiz session form.
- `chapterId` - optional `qb_taxonomy_v1` chapter node ID selected in the quiz session form.
- `randomQuestionTypeCounts` - optional per-type limits for randomly picking questions from the selected question list. Missing or empty means use all questions.
- `studentDifficultyLevels` - optional admission-number keyed difficulty overrides. Missing student entries use the quiz session default question selection.
- `archived` - optional soft archive flag. Teachers can archive and unarchive quiz sessions they created.

Quiz session taxonomy selections intentionally store IDs only. Do not duplicate class, subject, or chapter labels on the `classrooms` document; labels are read from `qb_taxonomy_v1`.

### `classSections`

Path:

```txt
/classSections/{sectionId}
```

The classroom editor and section browser load only sections where the signed-in Google email is a member with `admin` or `viewer` access:

```txt
classSections where members array-contains { email: currentUser.email.toLowerCase(), role: 'admin' }
classSections where members array-contains { email: currentUser.email.toLowerCase(), role: 'viewer' }
```

Supported display fields:

```js
{
  sectionName: 'DSS grade 8',
  name: 'DSS grade 8',
  className: 'DSS grade 8',
  title: 'DSS grade 8',
  sortOrder: 0,
  enabled: true,
  members: [
    {
      email: 'teacher@example.com',
      role: 'admin'
    },
    {
      email: 'viewer@example.com',
      role: 'viewer'
    }
  ],
  createdBy: 'admin@example.com',
  updatedBy: 'admin@example.com',
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdDate: 1788177950135
}
```

Member emails should be stored lowercase. `admin` and `viewer` members can view the section and its student roster. `admin` members can also manage students if rules allow that app path.

The selected option is saved into classrooms as:

```js
{
  sectionId: 'classSections document id',
  sectionName: 'DSS grade 8'
}
```

Section rosters are read from:

```txt
/classSections/{sectionId}/students/{studentDocId}
```

Student document shape:

```js
{
  admissionNo: '102',
  name: 'Parunandi Sai Adithya',
  phone: '8328303045'
}
```

### `qb_lists_v1`

Path:

```txt
/qb_lists_v1/{listId}
```

Document shape:

```js
{
  name: 'Favorites',
  ownerUid: 'firebase-auth-uid',
  questionIds: [
    'qb_questions_v1 document id'
  ],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Important fields:

- `ownerUid` - must match the signed-in teacher UID for the list to appear in the classroom editor.
- `name` - shown in the classroom question-list dropdown.
- `questionIds` - stores question document IDs, not embedded question snapshots.

### `qb_taxonomy_v1`

Path:

```txt
/qb_taxonomy_v1/{taxonomyId}
```

Document shape:

```js
{
  type: 'class' | 'subject' | 'chapter' | 'topic',
  label: 'Polynomials',
  parentId: 'class_ix__subject_mathematics__chapter_algebra',
  classId: 'class_ix',
  subjectId: 'class_ix__subject_mathematics',
  chapterId: 'class_ix__subject_mathematics__chapter_algebra',
  topicId: 'class_ix__subject_mathematics__chapter_algebra__topic_polynomials',
  updatedAt: Timestamp
}
```

Important fields:

- `type` - identifies the taxonomy level.
- `label` - human-readable label shown in topic analysis.
- `classId`, `subjectId`, `chapterId`, `topicId` - stable IDs used by question documents.
- `parentId` - parent taxonomy ID for hierarchy traversal.

The quiz session create/edit form reads `class`, `subject`, and `chapter` nodes from this collection. The selected values are saved on `classrooms` as `classId`, `subjectId`, and `chapterId` only.

### `qb_questions_v1`

Path:

```txt
/qb_questions_v1/{questionId}
```

Document shape:

```js
{
  type: 'mcq' | 'true_false' | 'fib' | 'short_answer',
  classId: 'class_ix',
  subjectId: 'class_ix__subject_mathematics',
  chapterId: 'class_ix__subject_mathematics__chapter_algebra',
  topicId: 'class_ix__subject_mathematics__chapter_algebra__topic_polynomials',
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Very Hard',
  status: 'published' | 'draft' | 'archived',
  promptHtml: '<p>Question text with rich HTML</p>',
  options: [
    { html: 'Option A rich HTML', correct: true },
    { html: 'Option B rich HTML', correct: false },
    { html: 'Option C rich HTML', correct: true },
    { html: 'Option D rich HTML', correct: false }
  ],
  trueAnswer: true,
  fibBanks: [
    { label: 'Blank 1', answers: ['0', 'zero'] },
    { label: 'Blank 2', answers: ['100', 'one hundred'] }
  ],
  shortAnswerHtml: '<p>Expected answer</p>',
  translations: {
    hi: {
      question: 'Translated question',
      answer: 'Translated answer',
      options: ['Translated A', 'Translated B', 'Translated C', 'Translated D']
    }
  },
  authorUid: 'firebase-auth-uid',
  authorName: 'Teacher Name',
  createdAt: Timestamp,
  updatedAt: Timestamp,
  archivedAt: Timestamp
}
```

Important fields:

- `type` - used by the dashboard question-type filter and analysis tables.
- `classId`, `subjectId`, `chapterId`, `topicId` - joined client-side with `qb_taxonomy_v1` to show topic paths.
- `promptHtml` - used as the question label when a submission answer only stores `questionId`.
- `status` - allows question-bank tools to hide draft or archived items from quiz selection.

### `qb_quiz_submissions_v1`

Path:

```txt
/qb_quiz_submissions_v1/{submissionId}
```

Document shape:

```js
{
  classroomId: '176260',
  sectionId: 'QQAP9O4UyvlaYhqz7jdE',
  admissionNo: '102',
  studentName: 'Parunandi Sai Adithya',
  studentKey: 'QQAP9O4UyvlaYhqz7jdE_102',

  className: 'IX',
  subject: 'Mathematics',
  chapters: ['Algebra', 'Polynomials'],
  difficulty: 'Easy',

  questionCount: 10,
  answeredCount: 8,
  gradableCount: 7,
  correctCount: 5,

  answers: [
    {
      questionId: 'question-doc-id',
      type: 'mcq',
      promptHtml: '<p>Question snapshot</p>',
      displayAnswer: 'Option A',
      isCorrect: true,
      correctAnswer: 'Option A',
      aiReview: {
        marks: 3,
        maxMarks: 4,
        reason: 'Shows partial understanding but misses one required point.',
        source: 'ai',
        answerSource: 'teacher',
        questionIndex: 0,
        questionId: 'question-doc-id',
        reviewedByUid: 'firebase-auth-uid',
        reviewedByEmail: 'teacher@example.com',
        updatedAt: 1788265300000
      },
      selectedOptions: [0],
      fibAnswers: [],
      trueFalseAnswer: null,
      shortAnswer: ''
    }
  ],

  submittedAt: Timestamp,
  submittedAtMillis: 1788264300000
}
```

Important fields:

- `classroomId` - used to load submissions for the selected classroom.
- `sectionId` - links the submission to the student's class section.
- `studentKey` - `${sectionId}_${admissionNo}`.
- `answers` - contains question snapshots and student answer snapshots for detailed review.
- `isCorrect` - `true` or `false` for auto-graded items, `null` for short-answer/manual-review items.
- `answers[].aiReview` - optional Gemini/teacher review marks and reason for FIB or short-answer items. Students can read this later from the submission document.
- `submittedAtMillis` - used for newest-first client sorting.

## Query Patterns

Classroom list:

```txt
classrooms where creatorId == currentUser.uid
```

Question list dropdown:

```txt
qb_lists_v1 where ownerUid == currentUser.uid
```

Section dropdown:

```txt
classSections where members array-contains { email: currentUser.email.toLowerCase(), role: 'admin' }
classSections where members array-contains { email: currentUser.email.toLowerCase(), role: 'viewer' }
```

Section roster:

```txt
classSections/{sectionId}/students
```

Section admin classroom list:

```txt
classrooms where sectionId == selectedSectionId
```

Submission loading for a selected classroom:

```txt
qb_quiz_submissions_v1 where classroomId == classroom.id
qb_quiz_submissions_v1 where classroomId == classroom.classCode
```

The app de-duplicates submissions by document ID and sorts by `submittedAtMillis` newest first.

## Suggested Indexes

```txt
classrooms:
  creatorId ASC

classrooms:
  sectionId ASC

qb_lists_v1:
  ownerUid ASC

qb_quiz_submissions_v1:
  classroomId ASC

qb_quiz_submissions_v1:
  sectionId ASC
```

If sorting is moved into Firestore later:

```txt
qb_quiz_submissions_v1:
  classroomId ASC
  submittedAtMillis DESC

qb_quiz_submissions_v1:
  sectionId ASC
  submittedAtMillis DESC
```

## Security Notes

The cleanest production rule is to write a teacher ownership field into each submission:

```js
{
  teacherUid: 'teacher-auth-uid'
}
```

Then dashboard reads can be restricted with:

```txt
request.auth.uid == resource.data.teacherUid
```

Without `teacherUid`, rules can authorize `classroomId` reads when `classroomId` matches an actual classroom document ID. Section-level fallback reads are harder to secure in Firestore rules because rules cannot query for "a classroom owned by this teacher with this sectionId." In that case, prefer adding `teacherUid` to submissions in the quiz-taking app.
