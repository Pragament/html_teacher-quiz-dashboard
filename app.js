import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    addDoc,
    collection,
    deleteField,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    query,
    serverTimestamp,
    updateDoc,
    where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyAYlezFn0tSSQHA-vRnJeBfJ-Om1YlDghk',
    authDomain: 'eschool-dev-4c6b4.firebaseapp.com',
    projectId: 'eschool-dev-4c6b4',
    storageBucket: 'eschool-dev-4c6b4.firebasestorage.app',
    messagingSenderId: '875648503944',
    appId: '1:875648503944:web:5423a89ccd19e06c6f0f3d',
    measurementId: 'G-05GNVCMP1F'
};

const COLLECTIONS = {
    classSections: 'classSections',
    classrooms: 'classrooms',
    questionBankLists: 'qb_lists_v1',
    questionBankQuestions: 'qb_questions_v1',
    taxonomy: 'qb_taxonomy_v1',
    submissions: 'qb_quiz_submissions_v1'
};

const EXPORT_SETTINGS_KEY = 'teacherQuizDashboard.exportSettings.v1';
const TOUR_PROMPT_DISABLED_KEY = 'teacherQuizDashboard.tourPromptDisabled.v1';
const GEMINI_KEY_STORAGE_KEY = 'teacherQuizDashboard.geminiApiKey.v1';
const AI_REVIEW_STORAGE_KEY = 'teacherQuizDashboard.aiReviews.v1';
const GEMINI_MODEL = 'models/gemini-3.6-flash';
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const QUESTION_TYPE_PICK_FIELDS = [
    { key: 'mcq', inputId: 'pickMcqCount' },
    { key: 'fib', inputId: 'pickFibCount' },
    { key: 'short_answer', inputId: 'pickShortAnswerCount' },
    { key: 'true_false', inputId: 'pickTrueFalseCount' }
];
const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Hard', 'Very Hard'];
const EXPORT_FIELDS = [
    { id: 'classroomId', label: 'Quiz Session ID', header: 'classroomId', value: (s) => s.classroomId || activeClassroomId || '' },
    { id: 'classCode', label: 'Session Code', header: 'classCode', value: (s, classroom) => classroom.classCode || '' },
    { id: 'sectionId', label: 'Class Section ID', header: 'sectionId', value: (s, classroom) => s.sectionId || classroom.sectionId || '' },
    { id: 'studentName', label: 'Student Name', header: 'studentName', value: (s) => s.studentName || '' },
    { id: 'admissionNo', label: 'Admission No', header: 'admissionNo', value: (s) => s.admissionNo || '' },
    { id: 'submittedAt', label: 'Submitted At', header: 'submittedAt', value: (s) => formatDate(s.submittedAtMillis) },
    { id: 'subject', label: 'Subject', header: 'subject', value: (s) => s.subject || '' },
    { id: 'chapters', label: 'Chapters', header: 'chapters', value: (s) => (s.chapters || []).join('|') },
    { id: 'questionCount', label: 'Question Count', header: 'questionCount', value: (s) => s.questionCount || 0 },
    { id: 'answeredCount', label: 'Answered Count', header: 'answeredCount', value: (s) => s.answeredCount || 0 },
    { id: 'gradableCount', label: 'Gradable Count', header: 'gradableCount', value: (s) => s.gradableCount || 0 },
    { id: 'correctCount', label: 'Correct Count', header: 'correctCount', value: (s) => s.correctCount || 0 },
    { id: 'scorePercent', label: 'Score Percent', header: 'scorePercent', value: (s) => scorePercent(s) },
    { id: 'manualReviewCount', label: 'Manual Review Count', header: 'manualReviewCount', value: (s) => manualCount(s) }
];
const SECTION_REPORT_EXPORT_COLUMNS = [
    { id: 'question', label: 'Question', header: 'Question', selected: true, value: row => row.title },
    { id: 'type', label: 'Question Type', header: 'Question Type', selected: true, value: row => questionTypeLabel(row.type || 'unknown') },
    { id: 'topic', label: 'Topic', header: 'Topic', selected: true, value: row => row.topic },
    { id: 'seen', label: 'Seen By', header: 'Seen By', selected: true, value: row => row.seenBy },
    { id: 'avg', label: 'Avg', header: 'Avg', selected: false, value: row => `${row.avgPercent}%` },
    { id: 'correct', label: 'Correct', header: 'Correct', selected: false, value: row => percentLabel(row.correct, row.total) },
    { id: 'partial', label: 'Partial', header: 'Partial', selected: false, value: row => percentLabel(row.partial, row.total) },
    { id: 'wrong', label: 'Wrong', header: 'Wrong', selected: true, value: row => percentLabel(row.wrong, row.total) },
    { id: 'wrongOption', label: 'Most Wrong Option', header: 'Most Wrong Option', selected: true, value: row => row.mostWrongOption || '-' },
    { id: 'pending', label: 'Needs Review', header: 'Needs Review', selected: false, value: row => row.pending }
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let classrooms = [];
let classSections = [];
let sectionStudents = [];
let sectionClassrooms = [];
let questionBankLists = [];
let taxonomyNodes = [];
let questionMetadataById = new Map();
let taxonomyById = new Map();
let activeClassroomId = null;
let activeSectionId = null;
let submissions = [];
let submissionViewMode = 'students';
let submissionSort = { key: 'score', direction: 'desc' };
let sectionReportSubmissions = [];
let sectionReportSort = { key: 'seen', direction: 'desc' };
let analysisSort = {
    students: { key: 'score', direction: 'desc' },
    topics: { key: 'avg', direction: 'asc' },
    questions: { key: 'avg', direction: 'asc' }
};
let showArchivedClassrooms = false;
let activeQuestionReview = null;
let aiReviews = loadAiReviews();
let aiReviewInFlight = false;
let selectedAiReviewKeys = new Set();
let activeStudentReport = null;
let studentReportSort = {
    subjects: { key: 'subject', direction: 'asc' },
    types: { key: 'avg', direction: 'asc' },
    topics: { key: 'avg', direction: 'asc' },
    recent: { key: 'date', direction: 'desc' }
};
let difficultySession = null;
let difficultyStudents = [];
let difficultySubmissionHistory = [];
let difficultyDraftLevels = {};
let difficultySort = { key: 'avg', direction: 'desc', subject: '' };
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const els = {
    topbar: $('topbar'),
    statusText: $('statusText'),
    loginBtn: $('loginBtn'),
    loginHeroBtn: $('loginHeroBtn'),
    tourBtn: $('tourBtn'),
    geminiKeyBtn: $('geminiKeyBtn'),
    logoutBtn: $('logoutBtn'),
    refreshBtn: $('refreshBtn'),
    loginView: $('loginView'),
    classroomPanel: $('classroomPanel'),
    dashboardView: $('dashboardView'),
    teacherLabel: $('teacherLabel'),
    createClassroomBtn: $('createClassroomBtn'),
    classroomCount: $('classroomCount'),
    classroomList: $('classroomList'),
    sectionCount: $('sectionCount'),
    sectionSummary: $('sectionSummary'),
    sectionList: $('sectionList'),
    studentRoster: $('studentRoster'),
    sectionClassrooms: $('sectionClassrooms'),
    selectedClassroomTitle: $('selectedClassroomTitle'),
    selectedClassroomMeta: $('selectedClassroomMeta'),
    enabledChip: $('enabledChip'),
    sectionReportSectionId: $('sectionReportSectionId'),
    sectionReportQuestionType: $('sectionReportQuestionType'),
    sectionReportSeenMin: $('sectionReportSeenMin'),
    sectionReportWrongMin: $('sectionReportWrongMin'),
    sectionReportExportFields: $('sectionReportExportFields'),
    exportSectionReportCsvBtn: $('exportSectionReportCsvBtn'),
    exportSectionReportPdfBtn: $('exportSectionReportPdfBtn'),
    refreshSectionReportBtn: $('refreshSectionReportBtn'),
    sectionReportSummary: $('sectionReportSummary'),
    sectionReportList: $('sectionReportList'),
    submissionSummary: $('submissionSummary'),
    submissionList: $('submissionList'),
    detailDialog: $('detailDialog'),
    detailTitle: $('detailTitle'),
    detailMeta: $('detailMeta'),
    detailStats: $('detailStats'),
    answerDetails: $('answerDetails'),
    studentReportDialog: $('studentReportDialog'),
    studentReportTitle: $('studentReportTitle'),
    studentReportMeta: $('studentReportMeta'),
    studentReportSubjectFilter: $('studentReportSubjectFilter'),
    studentReportSummary: $('studentReportSummary'),
    studentReportInsights: $('studentReportInsights'),
    studentReportTrend: $('studentReportTrend'),
    studentReportSubjectTable: $('studentReportSubjectTable'),
    studentReportTypeTable: $('studentReportTypeTable'),
    studentReportTopicTable: $('studentReportTopicTable'),
    studentReportRecentTable: $('studentReportRecentTable'),
    questionDialog: $('questionDialog'),
    questionDetailTitle: $('questionDetailTitle'),
    questionDetailMeta: $('questionDetailMeta'),
    questionPrompt: $('questionPrompt'),
    questionResponseList: $('questionResponseList'),
    aiReviewBtn: $('aiReviewBtn'),
    saveAiReviewOverridesBtn: $('saveAiReviewOverridesBtn'),
    selectAllAiReviewBtn: $('selectAllAiReviewBtn'),
    clearAiReviewSelectionBtn: $('clearAiReviewSelectionBtn'),
    aiReviewStatus: $('aiReviewStatus'),
    useAiAnswerForReview: $('useAiAnswerForReview'),
    sortQuestionByMarksDesc: $('sortQuestionByMarksDesc'),
    downloadQuestionPdfBtn: $('downloadQuestionPdfBtn'),
    geminiDialog: $('geminiDialog'),
    geminiKeyForm: $('geminiKeyForm'),
    geminiApiKey: $('geminiApiKey'),
    geminiKeyStatus: $('geminiKeyStatus'),
    removeGeminiKeyBtn: $('removeGeminiKeyBtn'),
    tourPromptDialog: $('tourPromptDialog'),
    tourPromptForm: $('tourPromptForm'),
    dontShowTourAgain: $('dontShowTourAgain'),
    studentAnalysisBtn: $('studentAnalysisBtn'),
    topicAnalysisBtn: $('topicAnalysisBtn'),
    questionAnalysisBtn: $('questionAnalysisBtn'),
    tableViewBtn: $('tableViewBtn'),
    cardViewBtn: $('cardViewBtn'),
    classroomDialog: $('classroomDialog'),
    editClassroomTitle: $('editClassroomTitle'),
    editClassroomForm: $('editClassroomForm'),
    editClassroomId: $('editClassroomId'),
    editClassroomName: $('editClassroomName'),
    editClassCode: $('editClassCode'),
    editSectionId: $('editSectionId'),
    editClassEnabled: $('editClassEnabled'),
    editQuestionBankList: $('editQuestionBankList'),
    editTaxonomyClassId: $('editTaxonomyClassId'),
    editTaxonomySubjectId: $('editTaxonomySubjectId'),
    editTaxonomyChapterId: $('editTaxonomyChapterId'),
    pickMcqCount: $('pickMcqCount'),
    pickFibCount: $('pickFibCount'),
    pickShortAnswerCount: $('pickShortAnswerCount'),
    pickTrueFalseCount: $('pickTrueFalseCount'),
    saveClassroomBtn: $('saveClassroomBtn'),
    showArchivedClassrooms: $('showArchivedClassrooms'),
    studentDifficultyDialog: $('studentDifficultyDialog'),
    studentDifficultyForm: $('studentDifficultyForm'),
    studentDifficultySummary: $('studentDifficultySummary'),
    studentDifficultyList: $('studentDifficultyList'),
    exportDialog: $('exportDialog'),
    exportForm: $('exportForm'),
    exportFieldList: $('exportFieldList'),
    includeQuestionResponses: $('includeQuestionResponses'),
    toast: $('toast')
};

const filterIds = ['classroomSearch', 'studentSearch', 'subjectFilter', 'chapterFilter', 'questionTypeFilter', 'resultFilter'];

if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
}

bindEvents();

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    els.topbar.hidden = !user;
    els.loginBtn.hidden = !!user;
    els.loginHeroBtn.hidden = !!user;
    els.tourBtn.hidden = !user;
    els.geminiKeyBtn.hidden = !user;
    els.logoutBtn.hidden = !user;
    els.refreshBtn.hidden = !user;
    els.loginView.hidden = !!user;
    els.classroomPanel.hidden = !user;
    els.dashboardView.hidden = !user;
    if (!user) {
        classrooms = [];
        classSections = [];
        sectionStudents = [];
        sectionClassrooms = [];
        questionBankLists = [];
        taxonomyNodes = [];
        questionMetadataById = new Map();
        taxonomyById = new Map();
        submissions = [];
        sectionReportSubmissions = [];
        activeClassroomId = null;
        activeSectionId = null;
        setStatus('Sign in to view your quiz sessions');
        render();
        promptGuidedTour();
        return;
    }
    els.teacherLabel.textContent = user.displayName || user.email || user.uid;
    await loadClassSections();
    await loadQuestionBankLists();
    await loadQuizSessionTaxonomy();
    await loadClassrooms();
    promptGuidedTour();
});

function bindEvents() {
    els.loginBtn.addEventListener('click', login);
    els.loginHeroBtn.addEventListener('click', login);
    els.tourBtn.addEventListener('click', startTeacherTour);
    els.geminiKeyBtn.addEventListener('click', openGeminiDialog);
    els.logoutBtn.addEventListener('click', () => signOut(auth));
    els.refreshBtn.addEventListener('click', refreshActive);
    $('createClassroomBtn').addEventListener('click', openClassroomCreator);
    els.showArchivedClassrooms.addEventListener('change', toggleArchivedClassrooms);
    els.refreshSectionReportBtn.addEventListener('click', loadSectionQuestionReport);
    els.sectionReportSectionId.addEventListener('change', loadSectionQuestionReport);
    els.sectionReportQuestionType.addEventListener('change', renderSectionQuestionReport);
    els.sectionReportSeenMin.addEventListener('input', renderSectionQuestionReport);
    els.sectionReportWrongMin.addEventListener('input', renderSectionQuestionReport);
    els.sectionReportList.addEventListener('click', handleSectionReportSortClick);
    els.exportSectionReportCsvBtn.addEventListener('click', exportSectionReportCsv);
    els.exportSectionReportPdfBtn.addEventListener('click', exportSectionReportPdf);
    $('closeDetailBtn').addEventListener('click', () => els.detailDialog.close());
    $('closeStudentReportBtn').addEventListener('click', () => els.studentReportDialog.close());
    els.studentReportSubjectFilter.addEventListener('change', renderStudentReport);
    els.studentReportDialog.addEventListener('click', handleStudentReportSortClick);
    $('closeQuestionBtn').addEventListener('click', () => els.questionDialog.close());
    $('cancelGeminiBtn').addEventListener('click', () => els.geminiDialog.close());
    els.geminiKeyForm.addEventListener('submit', saveGeminiKey);
    els.removeGeminiKeyBtn.addEventListener('click', removeGeminiKey);
    els.aiReviewBtn.addEventListener('click', reviewActiveQuestionWithGemini);
    els.saveAiReviewOverridesBtn.addEventListener('click', saveAiReviewOverrides);
    els.selectAllAiReviewBtn.addEventListener('click', () => selectAllAiReviewRows(true));
    els.clearAiReviewSelectionBtn.addEventListener('click', () => selectAllAiReviewRows(false));
    els.questionResponseList.addEventListener('change', handleAiReviewSelectionChange);
    els.sortQuestionByMarksDesc.addEventListener('change', renderQuestionResponses);
    els.downloadQuestionPdfBtn.addEventListener('click', downloadQuestionPdfReport);
    $('skipTourBtn').addEventListener('click', skipTourPrompt);
    $('cancelClassroomEditBtn').addEventListener('click', () => els.classroomDialog.close());
    els.editTaxonomyClassId.addEventListener('change', () => renderQuizSessionTaxonomyFields());
    els.editTaxonomySubjectId.addEventListener('change', () => renderQuizSessionTaxonomyFields());
    els.editTaxonomyChapterId.addEventListener('change', updateCreateQuizSessionName);
    $('skipStudentDifficultyBtn').addEventListener('click', () => els.studentDifficultyDialog.close());
    $('cancelExportBtn').addEventListener('click', () => els.exportDialog.close());
    els.editClassroomForm.addEventListener('submit', saveClassroomEdit);
    els.studentDifficultyForm.addEventListener('submit', saveStudentDifficulty);
    els.tourPromptForm.addEventListener('submit', startPromptedTour);
    els.exportForm.addEventListener('submit', exportSubmissionsCsv);
    $('exportCsvBtn').addEventListener('click', openExportDialog);
    els.studentAnalysisBtn.addEventListener('click', () => setSubmissionViewMode('students'));
    els.topicAnalysisBtn.addEventListener('click', () => setSubmissionViewMode('topics'));
    els.questionAnalysisBtn.addEventListener('click', () => setSubmissionViewMode('questions'));
    els.tableViewBtn.addEventListener('click', () => setSubmissionViewMode('table'));
    els.cardViewBtn.addEventListener('click', () => setSubmissionViewMode('cards'));
    filterIds.forEach(id => $(id).addEventListener('input', render));
    filterIds.forEach(id => $(id).addEventListener('change', render));
}

async function login() {
    await signInWithPopup(auth, new GoogleAuthProvider());
}

function promptGuidedTour() {
    if (localStorage.getItem(TOUR_PROMPT_DISABLED_KEY) === 'true') return;
    els.dontShowTourAgain.checked = false;
    if (!els.tourPromptDialog.open) els.tourPromptDialog.showModal();
}

function startPromptedTour(event) {
    event.preventDefault();
    saveTourPromptPreference();
    els.tourPromptDialog.close();
    if (currentUser) startTeacherTour();
    else startLoginTour();
}

function skipTourPrompt() {
    saveTourPromptPreference();
    els.tourPromptDialog.close();
}

function saveTourPromptPreference() {
    if (els.dontShowTourAgain.checked) {
        localStorage.setItem(TOUR_PROMPT_DISABLED_KEY, 'true');
    }
}

function startLoginTour() {
    if (!window.introJs) {
        toast('Tour library is still loading');
        return;
    }
    window.introJs().setOptions({
        showProgress: true,
        nextLabel: 'Next',
        prevLabel: 'Back',
        doneLabel: 'Done',
        steps: [
            {
                element: els.loginView,
                intro: 'Welcome to the Teacher Quiz Dashboard. Sign in to create quiz sessions, assign question lists, and review student quiz submissions.'
            },
            {
                element: els.loginHeroBtn,
                intro: 'Use Google Login with the teacher account that owns your quiz sessions.'
            }
        ]
    }).start();
}

function startTeacherTour() {
    if (!window.introJs) {
        toast('Tour library is still loading');
        return;
    }
    const tour = window.introJs().setOptions({
        showProgress: true,
        nextLabel: 'Next',
        prevLabel: 'Back',
        doneLabel: 'Done',
        steps: [
            {
                element: els.createClassroomBtn,
                intro: 'Start here to create a quiz session for a new quiz or student group.'
            },
            {
                element: els.editClassroomName,
                intro: 'Give the quiz session a clear name your teacher dashboard can recognize.'
            },
            {
                element: els.editQuestionBankList,
                intro: 'Optionally select one of your private question lists. This controls which saved bank list is attached to the quiz session.'
            },
            {
                element: els.editClassCode,
                intro: 'This session code is what students use to join or submit to the quiz session. You can keep the generated code or type your own.'
            },
            {
                element: els.saveClassroomBtn,
                intro: 'Save the quiz session when the name, question list, and code look right.'
            },
            {
                element: els.classroomList,
                intro: 'After saving, share the session code shown on the quiz session card with students.'
            }
        ]
    });
    tour.onbeforechange((target) => {
        if ([els.editClassroomName, els.editQuestionBankList, els.editClassCode, els.saveClassroomBtn].includes(target)) {
            ensureClassroomCreatorOpen();
        }
    });
    tour.start();
}

async function loadQuestionBankLists() {
    if (!currentUser) return;
    try {
        const snap = await getDocs(query(collection(db, COLLECTIONS.questionBankLists), where('ownerUid', '==', currentUser.uid)));
        questionBankLists = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
            return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        });
    } catch (error) {
        questionBankLists = [];
        toast('Unable to load question lists');
    }
}

async function loadQuizSessionTaxonomy() {
    try {
        const snap = await getDocs(collection(db, COLLECTIONS.taxonomy));
        taxonomyNodes = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(node => ['class', 'subject', 'chapter'].includes(node.type))
            .sort(compareTaxonomyNodes);
        taxonomyNodes.forEach(node => taxonomyById.set(node.id, node));
    } catch (error) {
        taxonomyNodes = [];
        toast('Unable to load class/subject/chapter taxonomy');
    }
}

function compareTaxonomyNodes(a, b) {
    const typeOrder = { class: 0, subject: 1, chapter: 2, topic: 3 };
    const typeDiff = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
    if (typeDiff) return typeDiff;
    return compareText(a.label || a.id, b.label || b.id);
}

async function loadQuestionMetadataForSubmissions(items, onProgress = null) {
    const questionIds = Array.from(new Set(items.flatMap(submission => {
        return (submission.answers || []).map(answer => answer?.questionId).filter(Boolean);
    })));
    const missingQuestionIds = questionIds.filter(id => !questionMetadataById.has(id));
    if (!missingQuestionIds.length) {
        onProgress?.({ loaded: questionIds.length, total: questionIds.length, phase: 'cached' });
        await loadTaxonomyForQuestions(questionIds.map(id => questionMetadataById.get(id)).filter(Boolean));
        return;
    }
    try {
        const loadedQuestions = [];
        for (const [index, questionId] of missingQuestionIds.entries()) {
            onProgress?.({ loaded: index, total: missingQuestionIds.length, phase: 'questions' });
            const snap = await getDoc(doc(db, COLLECTIONS.questionBankQuestions, questionId));
            if (!snap.exists()) {
                questionMetadataById.set(questionId, null);
                continue;
            }
            const question = { id: snap.id, ...snap.data() };
            questionMetadataById.set(questionId, question);
            loadedQuestions.push(question);
            onProgress?.({ loaded: index + 1, total: missingQuestionIds.length, phase: 'questions' });
        }
        const cachedQuestions = questionIds.map(id => questionMetadataById.get(id)).filter(Boolean);
        onProgress?.({ loaded: missingQuestionIds.length, total: missingQuestionIds.length, phase: 'taxonomy' });
        await loadTaxonomyForQuestions([...loadedQuestions, ...cachedQuestions]);
    } catch (error) {
        toast('Unable to load question topic metadata');
    }
}

async function loadTaxonomyForQuestions(questions) {
    const taxonomyIds = Array.from(new Set(questions.flatMap(question => {
        return [question.classId, question.subjectId, question.chapterId, question.topicId].filter(Boolean);
    }))).filter(id => !taxonomyById.has(id));
    if (!taxonomyIds.length) return;
    for (const taxonomyId of taxonomyIds) {
        try {
            const snap = await getDoc(doc(db, COLLECTIONS.taxonomy, taxonomyId));
            taxonomyById.set(taxonomyId, snap.exists() ? { id: snap.id, ...snap.data() } : null);
        } catch {
            taxonomyById.set(taxonomyId, null);
        }
    }
}

async function loadClassSections() {
    if (!currentUser) return;
    try {
        const email = String(currentUser.email || '').toLowerCase();
        const byId = new Map();
        const sectionQueries = [
            query(collection(db, COLLECTIONS.classSections), where('members', 'array-contains', { email, role: 'admin' })),
            query(collection(db, COLLECTIONS.classSections), where('members', 'array-contains', { email, role: 'viewer' }))
        ];
        for (const sectionQuery of sectionQueries) {
            const snap = await getDocs(sectionQuery);
            snap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
        }
        classSections = Array.from(byId.values()).sort((a, b) => {
            return sectionLabel(a).localeCompare(sectionLabel(b), undefined, { sensitivity: 'base' });
        });
        if (activeSectionId && !classSections.some(section => section.id === activeSectionId)) {
            activeSectionId = null;
            sectionStudents = [];
            sectionClassrooms = [];
        }
    } catch (error) {
        classSections = [];
        sectionStudents = [];
        sectionClassrooms = [];
        activeSectionId = null;
        toast('Unable to load sections');
    }
}

async function loadStudentsForSection(sectionId) {
    const section = classSections.find(item => item.id === sectionId);
    if (!section) return;
    activeSectionId = sectionId;
    sectionStudents = [];
    sectionClassrooms = [];
    renderSections();
    try {
        const snap = await getDocs(collection(db, COLLECTIONS.classSections, sectionId, 'students'));
        sectionStudents = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
            return String(a.admissionNo || a.id).localeCompare(String(b.admissionNo || b.id), undefined, { numeric: true });
        });
        if (canAdminSection(section)) {
            const classroomSnap = await getDocs(query(collection(db, COLLECTIONS.classrooms), where('sectionId', '==', sectionId)));
            sectionClassrooms = classroomSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
                return (b.createdDate || 0) - (a.createdDate || 0);
            });
        }
        renderSections();
    } catch (error) {
        sectionStudents = [];
        sectionClassrooms = [];
        renderSections();
        toast('Unable to load section details');
    }
}

async function loadClassrooms() {
    if (!currentUser) return;
    setStatus('Loading quiz sessions...');
    try {
        const snap = await getDocs(query(collection(db, COLLECTIONS.classrooms), where('creatorId', '==', currentUser.uid)));
        classrooms = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
            return (b.createdDate || 0) - (a.createdDate || 0);
        });
        if (!activeClassroomId || (!showArchivedClassrooms && findClassroom(activeClassroomId)?.archived === true)) {
            activeClassroomId = showArchivedClassrooms
                ? classrooms[0]?.id || null
                : classrooms.find(classroom => classroom.archived !== true)?.id || null;
        }
        renderClassrooms();
        if (activeClassroomId) await loadSubmissionsForClassroom(activeClassroomId);
        else {
            submissions = [];
            setStatus('No quiz sessions found for this teacher account.');
            render();
        }
    } catch (error) {
        setStatus(error.message || 'Unable to load quiz sessions');
        toast('Unable to load quiz sessions');
    }
}

async function refreshActive() {
    if (!currentUser) return;
    await loadClassSections();
    await loadQuestionBankLists();
    await loadClassrooms();
}

async function loadSubmissionsForClassroom(classroomId) {
    const classroom = findClassroom(classroomId);
    if (!classroom) return;
    setStatus('Loading submissions...');
    activeClassroomId = classroomId;
    renderClassrooms();
    const byId = new Map();
    const queries = [
        query(collection(db, COLLECTIONS.submissions), where('classroomId', '==', classroom.id))
    ];
    if (classroom.classCode && classroom.classCode !== classroom.id) {
        queries.push(query(collection(db, COLLECTIONS.submissions), where('classroomId', '==', classroom.classCode)));
    }
    try {
        for (const q of queries) {
            const snap = await getDocs(q);
            snap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
        }
        submissions = Array.from(byId.values()).sort((a, b) => (b.submittedAtMillis || 0) - (a.submittedAtMillis || 0));
        await loadQuestionMetadataForSubmissions(submissions);
        setStatus(`${submissions.length} submission${submissions.length === 1 ? '' : 's'} loaded`);
        render();
    } catch (error) {
        submissions = [];
        setStatus(error.message || 'Unable to load submissions');
        render();
    }
}

function render() {
    renderClassrooms();
    renderSections();
    renderSelectedClassroom();
    renderSectionReportOptions();
    renderSectionReportExportFields();
    renderSectionQuestionReport();
    renderSubmissions();
}

function renderClassrooms() {
    const search = $('classroomSearch').value.trim().toLowerCase();
    els.showArchivedClassrooms.checked = showArchivedClassrooms;
    const visible = classrooms.filter(c => {
        if ((c.archived === true) !== showArchivedClassrooms) return false;
        if (!search) return true;
        return [c.className, c.classCode, c.sectionName, c.sectionId].some(value => String(value || '').toLowerCase().includes(search));
    });
    const archivedCount = classrooms.filter(c => c.archived === true).length;
    els.classroomCount.textContent = showArchivedClassrooms ? `${visible.length}/${archivedCount}` : String(visible.length);
    els.classroomList.innerHTML = visible.length ? visible.map(c => `
        <article class="classroom-card ${c.id === activeClassroomId ? 'active' : ''} ${c.archived === true ? 'archived' : ''}">
            <button class="classroom-select" data-classroom="${c.id}">
                <strong>${esc(c.className || c.classCode || c.id)}</strong>
                <span>${esc(c.sectionName || c.sectionId || 'No class section')}</span>
                <span class="submission-meta">
                    <span>Session code ${esc(c.classCode || c.id)}</span>
                    <span>${c.classEnabled === true ? 'Enabled' : 'Disabled'}</span>
                    ${c.archived === true ? '<span>Archived</span>' : ''}
                </span>
                <span class="question-list-label">${esc(questionListName(c.questionBankListId))}</span>
                ${quizSessionTaxonomyLabel(c) ? `<span class="question-list-label">${esc(quizSessionTaxonomyLabel(c))}</span>` : ''}
                ${questionTypePickLabel(c.randomQuestionTypeCounts) ? `<span class="question-list-label">${esc(questionTypePickLabel(c.randomQuestionTypeCounts))}</span>` : ''}
                ${studentDifficultyLabel(c.studentDifficultyLevels) ? `<span class="question-list-label">${esc(studentDifficultyLabel(c.studentDifficultyLevels))}</span>` : ''}
            </button>
            <div class="classroom-card-actions">
                <button class="btn classroom-edit-btn" type="button" data-edit-classroom="${c.id}">Edit</button>
                <button class="btn classroom-archive-btn" type="button" data-archive-classroom="${c.id}" data-archive-value="${c.archived === true ? 'false' : 'true'}">${c.archived === true ? 'Unarchive' : 'Archive'}</button>
            </div>
        </article>
    `).join('') : `<div class="empty-card">No matching ${showArchivedClassrooms ? 'archived ' : ''}quiz sessions.</div>`;
    document.querySelectorAll('[data-classroom]').forEach(btn => {
        btn.addEventListener('click', () => loadSubmissionsForClassroom(btn.dataset.classroom));
    });
    document.querySelectorAll('[data-edit-classroom]').forEach(btn => {
        btn.addEventListener('click', () => openClassroomEditor(btn.dataset.editClassroom));
    });
    document.querySelectorAll('[data-archive-classroom]').forEach(btn => {
        btn.addEventListener('click', () => archiveClassroom(btn.dataset.archiveClassroom, btn.dataset.archiveValue === 'true'));
    });
}

function toggleArchivedClassrooms() {
    showArchivedClassrooms = els.showArchivedClassrooms.checked;
    const visible = classrooms.filter(classroom => (classroom.archived === true) === showArchivedClassrooms);
    if (!visible.some(classroom => classroom.id === activeClassroomId)) {
        activeClassroomId = visible[0]?.id || null;
        submissions = [];
        if (activeClassroomId) {
            loadSubmissionsForClassroom(activeClassroomId);
            return;
        }
    }
    render();
}

async function archiveClassroom(classroomId, archived) {
    const classroom = findClassroom(classroomId);
    if (!classroom || classroom.creatorId !== currentUser?.uid) return;
    const label = classroom.className || classroom.classCode || classroom.id;
    const confirmed = window.confirm(`${archived ? 'Archive' : 'Unarchive'} quiz session "${label}"?`);
    if (!confirmed) return;
    const updates = {
        archived,
        archivedAt: archived ? serverTimestamp() : deleteField(),
        archivedBy: archived ? currentUser.uid : deleteField(),
        updatedAt: serverTimestamp()
    };
    try {
        await updateDoc(doc(db, COLLECTIONS.classrooms, classroomId), updates);
        applyClassroomArchiveState(classroomId, archived);
        if (archived && activeClassroomId === classroomId && !showArchivedClassrooms) {
            activeClassroomId = classrooms.find(item => item.archived !== true)?.id || null;
            submissions = [];
            if (activeClassroomId) {
                await loadSubmissionsForClassroom(activeClassroomId);
                toast('Quiz session archived');
                return;
            }
        }
        render();
        toast(archived ? 'Quiz session archived' : 'Quiz session unarchived');
    } catch (error) {
        reportError(archived ? 'Unable to archive quiz session' : 'Unable to unarchive quiz session', error);
    }
}

function applyClassroomArchiveState(classroomId, archived) {
    [classrooms, sectionClassrooms].forEach(list => {
        const item = list.find(classroom => classroom.id === classroomId);
        if (!item) return;
        item.archived = archived;
        if (!archived) {
            delete item.archivedAt;
            delete item.archivedBy;
        }
    });
}

function renderSections() {
    els.sectionCount.textContent = String(classSections.length);
    els.sectionList.innerHTML = classSections.length ? classSections.map(section => `
        <button class="section-card ${section.id === activeSectionId ? 'active' : ''}" type="button" data-section="${section.id}">
            <strong>${esc(sectionLabel(section))}</strong>
            <span>${esc(section.id)}</span>
        </button>
    `).join('') : '<div class="empty-card">No class sections found.</div>';
    els.sectionSummary.textContent = activeSectionId
        ? `${sectionStudents.length} student${sectionStudents.length === 1 ? '' : 's'} in ${sectionLabel(classSections.find(section => section.id === activeSectionId) || {})}`
        : 'Select a class section to view students.';
    els.studentRoster.innerHTML = activeSectionId
        ? sectionStudents.length ? `
            <div class="student-table-wrap">
                <table class="student-table">
                    <thead>
                        <tr>
                            <th scope="col">Admission</th>
                            <th scope="col">Name</th>
                            <th scope="col">Phone</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sectionStudents.map(student => `
                            <tr>
                                <td>${esc(student.admissionNo || student.id)}</td>
                                <td>${esc(student.name || '')}</td>
                                <td>${esc(student.phone || '')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : '<div class="empty-card">No students found in this class section.</div>'
        : '';
    els.sectionClassrooms.innerHTML = activeSectionId && canAdminSection(classSections.find(section => section.id === activeSectionId) || {})
        ? `
            <div class="section-subhead">
                <strong>Quiz Sessions</strong>
                <span>${sectionClassrooms.length}</span>
            </div>
            ${sectionClassrooms.length ? sectionClassrooms.map(classroom => `
                <article class="section-classroom-card ${classroom.archived === true ? 'archived' : ''}">
                    <button class="section-classroom-main" type="button" data-section-classroom="${classroom.id}">
                        <strong>${esc(classroom.className || classroom.classCode || classroom.id)}</strong>
                        <span>Session code ${esc(classroom.classCode || classroom.id)}</span>
                        <span>Date ${esc(formatQuizSessionDate(classroom))}</span>
                        ${quizSessionTaxonomyLabel(classroom) ? `<span>${esc(quizSessionTaxonomyLabel(classroom))}</span>` : ''}
                        <span>${classroom.classEnabled === true ? 'Enabled' : 'Disabled'}${classroom.archived === true ? ' · Archived' : ''}</span>
                    </button>
                    <div class="section-classroom-actions">
                        <button class="btn small" type="button" data-edit-classroom="${classroom.id}">Edit</button>
                        ${classroom.creatorId === currentUser.uid ? `<button class="btn small" type="button" data-archive-classroom="${classroom.id}" data-archive-value="${classroom.archived === true ? 'false' : 'true'}">${classroom.archived === true ? 'Unarchive' : 'Archive'}</button>` : ''}
                    </div>
                </article>
            `).join('') : '<div class="empty-card">No quiz sessions found in this class section.</div>'}
        `
        : '';
    document.querySelectorAll('[data-section]').forEach(btn => {
        btn.addEventListener('click', () => loadStudentsForSection(btn.dataset.section));
    });
    document.querySelectorAll('[data-section-classroom]').forEach(btn => {
        btn.addEventListener('click', () => selectSectionClassroom(btn.dataset.sectionClassroom));
    });
    els.sectionClassrooms.querySelectorAll('[data-edit-classroom]').forEach(btn => {
        btn.addEventListener('click', () => editSectionClassroom(btn.dataset.editClassroom));
    });
    els.sectionClassrooms.querySelectorAll('[data-archive-classroom]').forEach(btn => {
        btn.addEventListener('click', () => archiveClassroom(btn.dataset.archiveClassroom, btn.dataset.archiveValue === 'true'));
    });
}

function selectSectionClassroom(classroomId) {
    loadSubmissionsForClassroom(classroomId);
}

function editSectionClassroom(classroomId) {
    openClassroomEditor(classroomId);
}

async function openClassroomCreator(options = {}) {
    const modal = options.modal !== false;
    els.editClassroomTitle.textContent = 'Create Quiz Session';
    els.editClassroomId.value = '';
    els.editClassroomName.value = '';
    els.editClassroomName.disabled = true;
    els.editClassCode.value = await generateUniqueClassCode();
    renderSectionOptions();
    els.editClassEnabled.checked = true;
    els.editQuestionBankList.innerHTML = `
        <option value="">No question list</option>
        ${questionBankLists.map(list => `<option value="${esc(list.id)}">${esc(list.name || list.id)}</option>`).join('')}
    `;
    els.editQuestionBankList.value = '';
    setQuizSessionTaxonomyFieldsVisible(true);
    renderQuizSessionTaxonomyFields({ classId: '', subjectId: '', chapterId: '' });
    updateCreateQuizSessionName();
    setQuestionTypePickFields();
    els.saveClassroomBtn.textContent = 'Create Quiz Session';
    if (modal) els.classroomDialog.showModal();
    else els.classroomDialog.show();
}

function ensureClassroomCreatorOpen() {
    if (!els.classroomDialog.open) openClassroomCreator({ modal: false });
}

function renderSectionOptions(selectedSectionId = '') {
    els.editSectionId.innerHTML = `
        <option value="">No class section</option>
        ${classSections.map(section => `<option value="${esc(section.id)}">${esc(sectionLabel(section))}</option>`).join('')}
    `;
    els.editSectionId.value = classSections.some(section => section.id === selectedSectionId) ? selectedSectionId : '';
}

function renderQuizSessionTaxonomyFields(selection = {}) {
    const requestedClassId = selection.classId ?? els.editTaxonomyClassId.value;
    const classNodes = taxonomyNodes.filter(node => node.type === 'class');
    const classId = classNodes.some(node => node.id === requestedClassId) ? requestedClassId : '';
    els.editTaxonomyClassId.innerHTML = taxonomySelectOptions('No class taxonomy', classNodes);
    els.editTaxonomyClassId.value = classId;

    const requestedSubjectId = selection.subjectId ?? els.editTaxonomySubjectId.value;
    const subjectNodes = taxonomyNodes.filter(node => {
        if (node.type !== 'subject') return false;
        if (!classId) return true;
        return node.classId === classId || node.parentId === classId;
    });
    const subjectId = subjectNodes.some(node => node.id === requestedSubjectId) ? requestedSubjectId : '';
    els.editTaxonomySubjectId.innerHTML = taxonomySelectOptions('No subject taxonomy', subjectNodes);
    els.editTaxonomySubjectId.value = subjectId;

    const requestedChapterId = selection.chapterId ?? els.editTaxonomyChapterId.value;
    const chapterNodes = taxonomyNodes.filter(node => {
        if (node.type !== 'chapter') return false;
        if (subjectId) return node.subjectId === subjectId || node.parentId === subjectId;
        if (classId) return node.classId === classId;
        return true;
    });
    const chapterId = chapterNodes.some(node => node.id === requestedChapterId) ? requestedChapterId : '';
    els.editTaxonomyChapterId.innerHTML = taxonomySelectOptions('No chapter taxonomy', chapterNodes);
    els.editTaxonomyChapterId.value = chapterId;
    updateCreateQuizSessionName();
}

function taxonomySelectOptions(blankLabel, nodes) {
    return `
        <option value="">${esc(blankLabel)}</option>
        ${nodes.map(node => `<option value="${esc(node.id)}">${esc(node.label || node.id)}</option>`).join('')}
    `;
}

function selectedQuizSessionTaxonomy() {
    return {
        classId: els.editTaxonomyClassId.value || '',
        subjectId: els.editTaxonomySubjectId.value || '',
        chapterId: els.editTaxonomyChapterId.value || ''
    };
}

function applyQuizSessionTaxonomyToUpdates(target, taxonomy) {
    ['classId', 'subjectId', 'chapterId'].forEach(field => {
        target[field] = taxonomy[field] || deleteField();
    });
}

function applyQuizSessionTaxonomyToValues(target, taxonomy) {
    ['classId', 'subjectId', 'chapterId'].forEach(field => {
        if (taxonomy[field]) target[field] = taxonomy[field];
    });
}

function setQuizSessionTaxonomyFieldsVisible(visible) {
    els.editClassroomForm.querySelectorAll('.taxonomy-field').forEach(field => {
        field.hidden = !visible;
    });
    [els.editTaxonomyClassId, els.editTaxonomySubjectId, els.editTaxonomyChapterId].forEach(select => {
        select.disabled = !visible;
    });
}

function updateCreateQuizSessionName() {
    if (els.editClassroomId.value) return;
    const labels = [els.editTaxonomyClassId, els.editTaxonomySubjectId, els.editTaxonomyChapterId]
        .map(select => select.selectedOptions[0]?.textContent || '')
        .filter(label => label && !label.startsWith('No '));
    els.editClassroomName.value = labels.join(' - ');
}

function openClassroomEditor(classroomId) {
    const classroom = findClassroom(classroomId);
    if (!classroom) return;
    els.editClassroomTitle.textContent = `Edit Quiz Session: ${classroom.className || classroom.classCode || classroom.id}`;
    els.editClassroomId.value = classroom.id;
    els.editClassroomName.value = classroom.className || '';
    els.editClassroomName.disabled = false;
    els.editClassCode.value = classroom.classCode || '';
    renderSectionOptions(classroom.sectionId, classroom.sectionName);
    els.editClassEnabled.checked = classroom.classEnabled === true;
    els.editQuestionBankList.innerHTML = `
        <option value="">No question list</option>
        ${questionBankLists.map(list => `<option value="${esc(list.id)}">${esc(list.name || list.id)}</option>`).join('')}
    `;
    els.editQuestionBankList.value = classroom.questionBankListId || '';
    setQuizSessionTaxonomyFieldsVisible(true);
    renderQuizSessionTaxonomyFields({
        classId: classroom.classId || '',
        subjectId: classroom.subjectId || '',
        chapterId: classroom.chapterId || ''
    });
    setQuestionTypePickFields(classroom.randomQuestionTypeCounts);
    els.saveClassroomBtn.textContent = 'Save Quiz Session';
    els.classroomDialog.showModal();
}

async function saveClassroomEdit(event) {
    event.preventDefault();
    if (!currentUser) return;
    const classroomId = els.editClassroomId.value;
    const classroom = findClassroom(classroomId);
    const questionBankListId = els.editQuestionBankList.value;
    const selectedList = questionBankLists.find(list => list.id === questionBankListId);
    const selectedSection = classSections.find(section => section.id === els.editSectionId.value);
    const selectedTaxonomy = selectedQuizSessionTaxonomy();
    const className = els.editClassroomName.value.trim();
    const classCode = els.editClassCode.value.trim() || generateClassCode();
    const updates = {
        className,
        classCode,
        classEnabled: els.editClassEnabled.checked,
        updatedAt: serverTimestamp()
    };
    if (selectedSection) {
        updates.sectionId = selectedSection.id;
        updates.sectionName = sectionLabel(selectedSection);
    } else {
        updates.sectionId = deleteField();
        updates.sectionName = deleteField();
        updates.studentDifficultyLevels = deleteField();
        updates.studentDifficultyUpdatedAt = deleteField();
    }
    if (selectedList) updates.questionBankListId = selectedList.id;
    else updates.questionBankListId = deleteField();
    applyQuizSessionTaxonomyToUpdates(updates, selectedTaxonomy);
    const randomQuestionTypeCounts = readQuestionTypePickFields();
    if (randomQuestionTypeCounts) updates.randomQuestionTypeCounts = randomQuestionTypeCounts;
    else updates.randomQuestionTypeCounts = deleteField();

    try {
        const duplicate = await findClassroomByCode(classCode, classroomId);
        if (duplicate) {
            toast(`Session code ${classCode} is already used by ${duplicate.className || duplicate.id}`);
            els.editClassCode.focus();
            return;
        }
    } catch (error) {
        reportError('Unable to verify session code', error);
        els.editClassCode.focus();
        return;
    }

    if (!classroom) {
        const createValues = {
            className,
            classCode,
            classEnabled: els.editClassEnabled.checked
        };
        if (selectedSection) {
            createValues.sectionId = selectedSection.id;
            createValues.sectionName = sectionLabel(selectedSection);
        }
        if (selectedList) createValues.questionBankListId = selectedList.id;
        applyQuizSessionTaxonomyToValues(createValues, selectedTaxonomy);
        if (randomQuestionTypeCounts) createValues.randomQuestionTypeCounts = randomQuestionTypeCounts;
        const createdClassroom = await createClassroom(createValues, selectedList, selectedSection);
        if (createdClassroom) await maybeOpenStudentDifficultyDialog(createdClassroom, selectedSection);
        return;
    }

    try {
        await updateDoc(doc(db, COLLECTIONS.classrooms, classroom.id), updates);
        const updatedClassroom = {
            ...classroom,
            ...updates,
            sectionId: selectedSection?.id,
            sectionName: selectedSection ? sectionLabel(selectedSection) : undefined,
            questionBankListId: selectedList?.id,
            classId: selectedTaxonomy.classId || undefined,
            subjectId: selectedTaxonomy.subjectId || undefined,
            chapterId: selectedTaxonomy.chapterId || undefined
        };
        if (!selectedSection) {
            delete updatedClassroom.sectionId;
            delete updatedClassroom.sectionName;
            delete updatedClassroom.studentDifficultyLevels;
        }
        if (!selectedList) delete updatedClassroom.questionBankListId;
        ['classId', 'subjectId', 'chapterId'].forEach(field => {
            if (!selectedTaxonomy[field]) delete updatedClassroom[field];
        });
        if (randomQuestionTypeCounts) updatedClassroom.randomQuestionTypeCounts = randomQuestionTypeCounts;
        else delete updatedClassroom.randomQuestionTypeCounts;
        syncClassroomState(updatedClassroom);
        els.classroomDialog.close();
        render();
        toast('Quiz session updated');
    } catch (error) {
        reportError('Unable to update quiz session', error);
        return;
    }
    await maybeOpenStudentDifficultyDialog(findClassroom(classroom.id) || classroom, selectedSection);
}

function syncClassroomState(updatedClassroom) {
    [classrooms, sectionClassrooms].forEach(list => {
        const index = list.findIndex(classroom => classroom.id === updatedClassroom.id);
        if (index !== -1) list[index] = { ...list[index], ...updatedClassroom };
    });
    if (activeSectionId && updatedClassroom.sectionId !== activeSectionId) {
        sectionClassrooms = sectionClassrooms.filter(classroom => classroom.id !== updatedClassroom.id);
    } else if (activeSectionId && updatedClassroom.sectionId === activeSectionId && !sectionClassrooms.some(classroom => classroom.id === updatedClassroom.id)) {
        sectionClassrooms = [updatedClassroom, ...sectionClassrooms].sort((a, b) => (b.createdDate || 0) - (a.createdDate || 0));
    }
}

async function createClassroom(formValues, selectedList, selectedSection) {
    const createdDate = Date.now();
    const classroomData = {
        ...formValues,
        creatorId: currentUser.uid,
        createdBy: currentUser.displayName || currentUser.email || '',
        createdDate,
        createdAt: serverTimestamp()
    };
    if (!selectedSection) {
        delete classroomData.sectionId;
        delete classroomData.sectionName;
    }
    if (!selectedList) delete classroomData.questionBankListId;

    try {
        const newRef = await addDoc(collection(db, COLLECTIONS.classrooms), classroomData);
        const newClassroom = {
            id: newRef.id,
            ...classroomData,
            questionBankListId: selectedList?.id
        };
        if (!selectedList) delete newClassroom.questionBankListId;
        classrooms = [newClassroom, ...classrooms].sort((a, b) => (b.createdDate || 0) - (a.createdDate || 0));
        activeClassroomId = newRef.id;
        submissions = [];
        els.classroomDialog.close();
        render();
        setStatus('Quiz session created');
        toast('Quiz session created');
        return newClassroom;
    } catch (error) {
        reportError('Unable to create quiz session', error);
    }
    return null;
}

function renderSelectedClassroom() {
    const classroom = findClassroom(activeClassroomId);
    if (!classroom) {
        els.selectedClassroomTitle.textContent = 'Select a quiz session';
        els.selectedClassroomMeta.textContent = '';
        els.enabledChip.textContent = 'No quiz session';
        els.enabledChip.className = 'status-chip';
        setStats(0, 0, '-', 0);
        return;
    }
    const filtered = filteredSubmissions();
    const studentCount = new Set(submissions.map(s => s.studentKey || `${s.sectionId}_${s.admissionNo}`)).size;
    const graded = submissions.filter(s => Number(s.gradableCount) > 0);
    const average = graded.length
        ? `${Math.round(graded.reduce((sum, s) => sum + scorePercent(s), 0) / graded.length)}%`
        : '-';
    const manual = submissions.reduce((sum, s) => sum + manualCount(s), 0);
    els.selectedClassroomTitle.textContent = classroom.className || classroom.classCode || classroom.id;
    els.selectedClassroomMeta.textContent = `Session code ${classroom.classCode || classroom.id} · ${classroom.sectionName || classroom.sectionId || 'No class section'} · ${questionListName(classroom.questionBankListId)} · ${filtered.length} filtered`;
    els.enabledChip.textContent = classroom.classEnabled === true ? 'Enabled' : 'Disabled';
    els.enabledChip.className = `status-chip ${classroom.classEnabled === true ? 'enabled' : 'disabled'}`;
    setStats(submissions.length, studentCount, average, manual);
}

function reportAccessibleSections() {
    const email = String(currentUser?.email || '').toLowerCase();
    return classSections.filter(section => (section.members || []).some(member => {
        const role = String(member.role || '').toLowerCase();
        return String(member.email || '').toLowerCase() === email && ['viewer', 'admin'].includes(role);
    }));
}

function renderSectionReportOptions() {
    const sections = reportAccessibleSections();
    const current = els.sectionReportSectionId.value;
    els.sectionReportSectionId.innerHTML = sections.length
        ? sections.map(section => `<option value="${esc(section.id)}">${esc(sectionLabel(section))}</option>`).join('')
        : '<option value="">No viewer sections</option>';
    els.sectionReportSectionId.value = sections.some(section => section.id === current) ? current : sections[0]?.id || '';
    els.refreshSectionReportBtn.disabled = !els.sectionReportSectionId.value;
    if (!sections.length) {
        sectionReportSubmissions = [];
        els.sectionReportSummary.textContent = 'No sections found where you have viewer or admin access.';
        els.sectionReportList.innerHTML = '<div class="empty-card">No viewer/admin-access sections available.</div>';
    }
}

async function loadSectionQuestionReport() {
    const sectionId = els.sectionReportSectionId.value;
    const section = reportAccessibleSections().find(item => item.id === sectionId);
    if (!section) {
        sectionReportSubmissions = [];
        renderSectionQuestionReport();
        return;
    }
    els.refreshSectionReportBtn.disabled = true;
    els.sectionReportSummary.textContent = `Loading enabled quiz sessions for ${sectionLabel(section)}...`;
    els.sectionReportList.innerHTML = '<div class="empty-card">Loading section question report...</div>';
    try {
        const classroomSnap = await getDocs(query(collection(db, COLLECTIONS.classrooms), where('sectionId', '==', sectionId)));
        const enabledClassrooms = classroomSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(classroom => classroom.classEnabled === true);
        const byId = new Map();
        if (!enabledClassrooms.length) {
            els.sectionReportSummary.textContent = `${sectionLabel(section)} · No enabled quiz sessions found`;
        }
        for (const [index, classroom] of enabledClassrooms.entries()) {
            const percent = Math.round((index / enabledClassrooms.length) * 100);
            els.sectionReportSummary.textContent = `${sectionLabel(section)} · Processing ${index + 1}/${enabledClassrooms.length} quiz sessions (${percent}%) · ${classroom.className || classroom.classCode || classroom.id}`;
            els.sectionReportList.innerHTML = `<div class="empty-card">Loading section question report... ${percent}%</div>`;
            const queries = [query(collection(db, COLLECTIONS.submissions), where('classroomId', '==', classroom.id))];
            if (classroom.classCode && classroom.classCode !== classroom.id) {
                queries.push(query(collection(db, COLLECTIONS.submissions), where('classroomId', '==', classroom.classCode)));
            }
            for (const submissionQuery of queries) {
                const snap = await getDocs(submissionQuery);
                snap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
            }
            const donePercent = Math.round(((index + 1) / enabledClassrooms.length) * 100);
            els.sectionReportSummary.textContent = `${sectionLabel(section)} · Processed ${index + 1}/${enabledClassrooms.length} quiz sessions (${donePercent}%)`;
            els.sectionReportList.innerHTML = `<div class="empty-card">Loading section question report... ${donePercent}%</div>`;
        }
        sectionReportSubmissions = Array.from(byId.values()).sort((a, b) => (b.submittedAtMillis || 0) - (a.submittedAtMillis || 0));
        els.sectionReportSummary.textContent = `${sectionLabel(section)} · Quiz sessions loaded. Loading question metadata...`;
        els.sectionReportList.innerHTML = '<div class="empty-card">Loading question metadata...</div>';
        await loadQuestionMetadataForSubmissions(sectionReportSubmissions, ({ loaded, total, phase }) => {
            const percent = total ? Math.round((loaded / total) * 100) : 100;
            const label = phase === 'taxonomy' ? 'Loading taxonomy labels' : phase === 'cached' ? 'Using cached question metadata' : 'Loading question metadata';
            els.sectionReportSummary.textContent = `${sectionLabel(section)} · ${label} (${percent}%)`;
            els.sectionReportList.innerHTML = `<div class="empty-card">${label}... ${percent}%</div>`;
        });
        els.sectionReportSummary.textContent = `${sectionLabel(section)} · ${enabledClassrooms.length} enabled quiz session${enabledClassrooms.length === 1 ? '' : 's'} · ${sectionReportSubmissions.length} submission${sectionReportSubmissions.length === 1 ? '' : 's'}`;
        renderSectionQuestionReport();
    } catch (error) {
        sectionReportSubmissions = [];
        els.sectionReportSummary.textContent = error.message || 'Unable to load section question report';
        els.sectionReportList.innerHTML = '<div class="empty-card">Unable to load section question report.</div>';
    } finally {
        els.refreshSectionReportBtn.disabled = !els.sectionReportSectionId.value;
    }
}

function setStats(submissionCount, studentCount, average, manual) {
    $('statSubmissions').textContent = String(submissionCount);
    $('statStudents').textContent = String(studentCount);
    $('statAverage').textContent = average;
    $('statManual').textContent = String(manual);
}

function renderSubmissions() {
    const filtered = filteredSubmissions();
    const sorted = sortedSubmissions(filtered);
    els.submissionSummary.textContent = `${filtered.length} visible of ${submissions.length} loaded submissions`;
    els.studentAnalysisBtn.classList.toggle('active', submissionViewMode === 'students');
    els.topicAnalysisBtn.classList.toggle('active', submissionViewMode === 'topics');
    els.questionAnalysisBtn.classList.toggle('active', submissionViewMode === 'questions');
    els.tableViewBtn.classList.toggle('active', submissionViewMode === 'table');
    els.cardViewBtn.classList.toggle('active', submissionViewMode === 'cards');
    els.submissionList.className = submissionViewMode === 'cards' ? 'submission-list' : 'submission-table-wrap analysis-table-wrap';
    els.submissionList.innerHTML = sorted.length
        ? renderSubmissionView(sorted)
        : '<div class="empty-card">No submissions match these filters.</div>';
    document.querySelectorAll('[data-detail]').forEach(btn => {
        btn.addEventListener('click', () => openSubmissionDetail(btn.dataset.detail));
    });
    document.querySelectorAll('[data-student-report]').forEach(btn => {
        btn.addEventListener('click', () => openStudentReport(btn.dataset.studentReport));
    });
    document.querySelectorAll('[data-question-key]').forEach(btn => {
        btn.addEventListener('click', () => openQuestionDetail(btn.dataset.questionKey));
    });
    document.querySelectorAll('[data-submission-sort]').forEach(btn => {
        btn.addEventListener('click', () => setSubmissionSort(btn.dataset.submissionSort));
    });
    document.querySelectorAll('[data-analysis-sort]').forEach(btn => {
        btn.addEventListener('click', () => setAnalysisSort(btn.dataset.analysisSort));
    });
}

function renderSubmissionView(items) {
    if (submissionViewMode === 'cards') return items.map(submissionCard).join('');
    if (submissionViewMode === 'topics') return topicAnalysisTable(items);
    if (submissionViewMode === 'questions') return questionAnalysisTable(items);
    if (submissionViewMode === 'table') return submissionTable(items);
    return studentAnalysisTable(items);
}

function setSubmissionViewMode(mode) {
    submissionViewMode = mode;
    renderSubmissions();
}

function submissionTable(items) {
    const questionColumns = buildQuestionColumns(items);
    const questionHeaders = questionColumns.map(column => `
        <th scope="col">
            <button class="question-head-btn" type="button" data-question-key="${esc(column.key)}" title="${esc(column.title)}">${esc(column.label)}</button>
        </th>
    `).join('');
    return `
        <table class="submission-table">
            <thead>
                <tr>
                    <th scope="col">${sortHeader('Student', 'student')}</th>
                    <th scope="col">${sortHeader('Roll', 'roll')}</th>
                    ${questionHeaders}
                    <th scope="col">${sortHeader('Total Score', 'score')}</th>
                    <th scope="col">${sortHeader('Review', 'review')}</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(s => `
                    <tr>
                        <th scope="row">
                            <button class="table-link" type="button" data-detail="${s.id}">${esc(s.studentName || 'Student')}</button>
                        </th>
                        <td>${esc(s.admissionNo || '')}</td>
                        ${questionColumns.map(column => answerCell(answerForQuestion(s, column.key).answer)).join('')}
                        <td>${esc(scoreLabel(s))}</td>
                        <td>${manualCount(s) ? esc(`${manualCount(s)} manual`) : ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function studentAnalysisTable(items) {
    const rows = sortedStudentAnalysisRows(items);
    return `
        <table class="submission-table analysis-table">
            <thead>
                <tr>
                    <th scope="col">${analysisSortHeader('Student', 'student')}</th>
                    <th scope="col">${analysisSortHeader('Roll', 'roll')}</th>
                    <th scope="col">${analysisSortHeader('Score', 'score')}</th>
                    <th scope="col">${analysisSortHeader('Attempted', 'attempted')}</th>
                    <th scope="col">${analysisSortHeader('Review', 'review')}</th>
                    <th scope="col">Strong Topics</th>
                    <th scope="col">Weak Topics</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(({ submission, summary }) => {
                    return `
                        <tr>
                            <th scope="row">
                                <button class="table-link" type="button" data-student-report="${submission.id}">${esc(submission.studentName || 'Student')}</button>
                            </th>
                            <td>${esc(submission.admissionNo || '')}</td>
                            <td>${esc(scoreLabel(submission))}</td>
                            <td>${esc(`${summary.attempted}/${summary.total}`)}</td>
                            <td>${manualCount(submission) ? esc(`${manualCount(submission)} manual`) : '0'}</td>
                            <td class="analysis-text-cell">${esc(summary.strongTopics.join(', ') || '-')}</td>
                            <td class="analysis-text-cell">${esc(summary.weakTopics.join(', ') || '-')}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function topicAnalysisTable(items) {
    const topics = Array.from(topicStats(items).values())
        .sort(compareTopicRows);
    return `
        <table class="submission-table analysis-table">
            <thead>
                <tr>
                    <th scope="col">${analysisSortHeader('Topic', 'topic')}</th>
                    <th scope="col">${analysisSortHeader('Question Type', 'type')}</th>
                    <th scope="col">${analysisSortHeader('Students', 'students')}</th>
                    <th scope="col">${analysisSortHeader('Answers', 'answers')}</th>
                    <th scope="col">${analysisSortHeader('Avg', 'avg')}</th>
                    <th scope="col">${analysisSortHeader('Correct', 'correct')}</th>
                    <th scope="col">${analysisSortHeader('Partial', 'partial')}</th>
                    <th scope="col">${analysisSortHeader('Wrong', 'wrong')}</th>
                    <th scope="col">${analysisSortHeader('Needs Review', 'pending')}</th>
                </tr>
            </thead>
            <tbody>
                ${topics.map(topic => `
                    <tr>
                        <th scope="row" class="analysis-text-cell">${esc(topic.label)}</th>
                        <td>${esc(questionTypeLabel(topic.type || 'mixed'))}</td>
                        <td>${topic.students.size}</td>
                        <td>${topic.total}</td>
                        <td>${topic.avgPercent}%</td>
                        <td>${percentLabel(topic.correct, topic.total)}</td>
                        <td>${percentLabel(topic.partial, topic.total)}</td>
                        <td>${percentLabel(topic.wrong, topic.total)}</td>
                        <td>${topic.pending}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function questionAnalysisTable(items) {
    const columns = buildQuestionColumns(items);
    const rows = columns.map(column => questionColumnStats(items, column))
        .sort(compareQuestionRows);
    return `
        <table class="submission-table analysis-table question-analysis-table">
            <thead>
                <tr>
                    <th scope="col">${analysisSortHeader('Question', 'question')}</th>
                    <th scope="col">${analysisSortHeader('Question Type', 'type')}</th>
                    <th scope="col">${analysisSortHeader('Topic', 'topic')}</th>
                    <th scope="col">${analysisSortHeader('Seen By', 'seen')}</th>
                    <th scope="col">${analysisSortHeader('Avg', 'avg')}</th>
                    <th scope="col">${analysisSortHeader('Correct', 'correct')}</th>
                    <th scope="col">${analysisSortHeader('Partial', 'partial')}</th>
                    <th scope="col">${analysisSortHeader('Wrong', 'wrong')}</th>
                    <th scope="col">${analysisSortHeader('Needs Review', 'pending')}</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        <th scope="row" class="analysis-text-cell">
                            <button class="table-link question-analysis-link" type="button" data-question-key="${esc(row.key)}" title="${esc(row.title)}">${esc(row.title)}</button>
                        </th>
                        <td>${esc(questionTypeLabel(row.type || 'unknown'))}</td>
                        <td class="analysis-text-cell">${esc(row.topic)}</td>
                        <td>${row.seenBy}</td>
                        <td>${row.avgPercent}%</td>
                        <td>${percentLabel(row.correct, row.total)}</td>
                        <td>${percentLabel(row.partial, row.total)}</td>
                        <td>${percentLabel(row.wrong, row.total)}</td>
                        <td>${row.pending}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderSectionQuestionReport() {
    if (!sectionReportSubmissions.length) {
        if (els.sectionReportSectionId.value) {
            els.sectionReportList.innerHTML = '<div class="empty-card">No submissions found for enabled quiz sessions in this section.</div>';
        }
        return;
    }
    const rows = filteredSectionQuestionRows(sectionQuestionReportRows(sectionReportSubmissions))
        .sort(compareSectionQuestionReportRows);
    els.sectionReportList.className = 'submission-table-wrap analysis-table-wrap';
    els.sectionReportList.innerHTML = rows.length
        ? sectionQuestionReportTable(rows)
        : '<div class="empty-card">No questions match these report filters.</div>';
}

function renderSectionReportExportFields() {
    els.sectionReportExportFields.innerHTML = SECTION_REPORT_EXPORT_COLUMNS.map(column => `
        <label class="check-field">
            <input type="checkbox" value="${esc(column.id)}" ${column.selected ? 'checked' : ''} />
            <span>${esc(column.label)}</span>
        </label>
    `).join('');
}

function currentSectionQuestionReportRows() {
    if (!sectionReportSubmissions.length) return [];
    return filteredSectionQuestionRows(sectionQuestionReportRows(sectionReportSubmissions))
        .sort(compareSectionQuestionReportRows);
}

function selectedSectionReportExportColumns() {
    const selectedIds = Array.from(els.sectionReportExportFields.querySelectorAll('input:checked')).map(input => input.value);
    return SECTION_REPORT_EXPORT_COLUMNS.filter(column => selectedIds.includes(column.id));
}

function exportSectionReportCsv() {
    const columns = selectedSectionReportExportColumns();
    if (!columns.length) {
        toast('Select at least one section report export column');
        return;
    }
    const rows = currentSectionQuestionReportRows();
    if (!rows.length) {
        toast('No section report rows to export');
        return;
    }
    const csvRows = [
        columns.map(column => column.header),
        ...rows.map(row => columns.map(column => column.value(row)))
    ];
    downloadBlob(new Blob([toCsv(csvRows)], { type: 'text/csv;charset=utf-8' }), `${sectionReportFileBaseName()}.csv`);
}

function exportSectionReportPdf() {
    const columns = selectedSectionReportExportColumns();
    if (!columns.length) {
        toast('Select at least one section report export column');
        return;
    }
    const rows = currentSectionQuestionReportRows();
    if (!rows.length) {
        toast('No section report rows to export');
        return;
    }
    const jspdf = window.jspdf?.jsPDF;
    if (!jspdf) {
        toast('PDF library is still loading');
        return;
    }
    const docPdf = new jspdf({ unit: 'pt', format: 'a4', orientation: columns.length > 5 ? 'landscape' : 'portrait' });
    const pageWidth = docPdf.internal.pageSize.getWidth();
    const pageHeight = docPdf.internal.pageSize.getHeight();
    const margin = 30;
    const tableWidth = pageWidth - margin * 2;
    const colWidth = tableWidth / columns.length;
    let y = margin;

    const addPageIfNeeded = (height = 16) => {
        if (y + height > pageHeight - margin) {
            docPdf.addPage();
            y = margin;
        }
    };
    const addText = (text, x, options = {}) => {
        const size = options.size || 8;
        const style = options.style || 'normal';
        const width = options.width || colWidth;
        docPdf.setFont('helvetica', style);
        docPdf.setFontSize(size);
        const lines = docPdf.splitTextToSize(textForPdf(text), width - 4);
        lines.slice(0, options.maxLines || 3).forEach(line => {
            docPdf.text(line, x, y);
            y += size + 3;
        });
    };

    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(14);
    docPdf.text('Section Question Report', margin, y);
    y += 18;
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9);
    docPdf.text(textForPdf(`${sectionReportContextLabel()} · Generated ${formatDate(Date.now())}`), margin, y);
    y += 18;

    addPageIfNeeded(24);
    const headerY = y;
    columns.forEach((column, index) => {
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8);
        docPdf.text(textForPdf(column.header), margin + index * colWidth, headerY);
    });
    y += 16;
    rows.forEach(row => {
        addPageIfNeeded(42);
        const rowY = y;
        let rowHeight = 12;
        columns.forEach((column, index) => {
            const x = margin + index * colWidth;
            docPdf.setFont('helvetica', 'normal');
            docPdf.setFontSize(8);
            const lines = docPdf.splitTextToSize(textForPdf(column.value(row)), colWidth - 4).slice(0, 3);
            lines.forEach((line, lineIndex) => docPdf.text(line, x, rowY + lineIndex * 10));
            rowHeight = Math.max(rowHeight, lines.length * 10 + 6);
        });
        y += rowHeight;
    });
    docPdf.save(`${sectionReportFileBaseName()}.pdf`);
}

function sectionReportContextLabel() {
    const section = reportAccessibleSections().find(item => item.id === els.sectionReportSectionId.value);
    return `${section ? sectionLabel(section) : 'Section'} · ${currentSectionQuestionReportRows().length} row${currentSectionQuestionReportRows().length === 1 ? '' : 's'}`;
}

function sectionReportFileBaseName() {
    return String(`section-question-report-${sectionReportContextLabel()}`)
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function sectionQuestionReportRows(items) {
    const columns = buildQuestionColumnsForSectionReport(items);
    return columns.map(column => questionColumnStatsForSectionReport(items, column));
}

function buildQuestionColumnsForSectionReport(items) {
    const columns = [];
    const seen = new Set();
    const typeFilter = els.sectionReportQuestionType.value;
    items.forEach(submission => {
        (submission.answers || []).forEach((answer, index) => {
            if (typeFilter && normalizedQuestionType(answer) !== typeFilter) return;
            const key = questionKeyForAnswer(answer, index);
            if (!key || seen.has(key)) return;
            seen.add(key);
            const questionText = questionTitleForAnswer(answer);
            columns.push({
                key,
                title: questionText || answer.questionId || `Question ${columns.length + 1}`
            });
        });
    });
    return columns;
}

function questionColumnStatsForSectionReport(items, column) {
    const stats = createAnalysisStats(column.title);
    const wrongOptionCounts = new Map();
    let topic = '';
    let type = '';
    items.forEach(submission => {
        const { answer, index } = answerForSectionReportQuestion(submission, column.key);
        if (!answer) return;
        if (!topic) topic = topicLabelForAnswer(answer, submission);
        if (!type) type = normalizedQuestionType(answer);
        addWrongOptionSelections(wrongOptionCounts, answer);
        addAnswerToStats(stats, submission, answer, index);
    });
    finalizeAnalysisStats(stats);
    const mostWrongOption = mostSelectedWrongOption(wrongOptionCounts);
    return {
        key: column.key,
        title: column.title,
        topic: topic || 'Unmapped',
        type,
        seenBy: stats.students.size,
        total: stats.total,
        avgPercent: stats.avgPercent,
        correct: stats.correct,
        partial: stats.partial,
        wrong: stats.wrong,
        pending: stats.pending,
        correctPercent: percentValue(stats.correct, stats.total) * 100,
        partialPercent: percentValue(stats.partial, stats.total) * 100,
        wrongPercent: percentValue(stats.wrong, stats.total) * 100,
        mostWrongOptionLabel: mostWrongOption?.label || '',
        mostWrongOptionCount: mostWrongOption?.count || 0,
        mostWrongOption: mostWrongOption
            ? `${mostWrongOption.label} (${mostWrongOption.count})`
            : '-'
    };
}

function addWrongOptionSelections(counts, answer) {
    if (answer?.isCorrect !== false || normalizedQuestionType(answer) !== 'mcq') return;
    wrongOptionLabelsForAnswer(answer).forEach(label => {
        if (!label) return;
        counts.set(label, (counts.get(label) || 0) + 1);
    });
}

function wrongOptionLabelsForAnswer(answer) {
    const selectedOptions = Array.isArray(answer?.selectedOptions) ? answer.selectedOptions : [];
    const labels = selectedOptions
        .map(selection => optionLabelForSelection(answer, selection))
        .filter(Boolean);
    const response = answerResponseText(answer).trim();
    if (labels.length && !labels.every(label => /^\d+$/.test(label))) return labels;
    return response ? [response] : labels;
}

function optionLabelForSelection(answer, selection) {
    const question = questionMetadataForAnswer(answer);
    const options = Array.isArray(question?.options) ? question.options : [];
    const optionIndex = optionIndexForSelection(selection, options.length);
    if (Number.isInteger(optionIndex) && options[optionIndex]) {
        const option = options[optionIndex];
        if (option?.correct === true) return '';
        const optionText = htmlToText(option?.html || option?.text || option?.label || '').trim();
        return `Option ${optionLetter(optionIndex)}${optionText ? `: ${optionText}` : ''}`;
    }
    return selectionText(selection);
}

function optionIndexForSelection(selection, optionCount = 0) {
    if (typeof selection === 'number' && Number.isInteger(selection)) {
        return normalizeOptionIndex(selection, optionCount);
    }
    if (selection && typeof selection === 'object') {
        const objectIndex = selection.index ?? selection.optionIndex ?? selection.value;
        if (typeof objectIndex === 'number' || /^\d+$/.test(String(objectIndex ?? '').trim())) {
            return normalizeOptionIndex(Number(objectIndex), optionCount);
        }
    }
    const value = selectionText(selection);
    if (!value) return null;
    if (/^\d+$/.test(value)) return normalizeOptionIndex(Number(value), optionCount);
    const optionMatch = value.match(/(?:option\s*)?([A-D])\b/i);
    if (optionMatch) return optionMatch[1].toUpperCase().charCodeAt(0) - 65;
    return null;
}

function normalizeOptionIndex(index, optionCount) {
    if (!optionCount || (index >= 0 && index < optionCount)) return index;
    if (index >= 1 && index <= optionCount) return index - 1;
    return null;
}

function selectionText(selection) {
    if (selection && typeof selection === 'object') {
        return htmlToText(selection.html || selection.text || selection.label || selection.value || '').trim();
    }
    return htmlToText(selection).trim();
}

function optionLetter(index) {
    return String.fromCharCode(65 + index);
}

function mostSelectedWrongOption(counts) {
    let winner = null;
    counts.forEach((count, label) => {
        if (!winner || count > winner.count || (count === winner.count && compareText(label, winner.label) < 0)) {
            winner = { label, count };
        }
    });
    return winner;
}

function answerForSectionReportQuestion(submission, questionKey) {
    const typeFilter = els.sectionReportQuestionType.value;
    const answers = submission.answers || [];
    const index = answers.findIndex((answer, answerIndex) => {
        if (typeFilter && normalizedQuestionType(answer) !== typeFilter) return false;
        return questionKeyForAnswer(answer, answerIndex) === questionKey;
    });
    return {
        answer: index === -1 ? null : answers[index],
        index
    };
}

function filteredSectionQuestionRows(rows) {
    const seenMin = Number(els.sectionReportSeenMin.value || 0);
    const wrongMin = Number(els.sectionReportWrongMin.value || 0);
    return rows.filter(row => {
        if (Number.isFinite(seenMin) && row.seenBy <= seenMin) return false;
        if (Number.isFinite(wrongMin) && row.wrongPercent <= wrongMin) return false;
        return true;
    });
}

function sectionQuestionReportTable(rows) {
    return `
        <table class="submission-table analysis-table question-analysis-table">
            <thead>
                <tr>
                    <th scope="col">${sectionReportSortHeader('Question', 'question')}</th>
                    <th scope="col">${sectionReportSortHeader('Question Type', 'type')}</th>
                    <th scope="col">${sectionReportSortHeader('Topic', 'topic')}</th>
                    <th scope="col">${sectionReportSortHeader('Seen By', 'seen')}</th>
                    <th scope="col">${sectionReportSortHeader('Avg', 'avg')}</th>
                    <th scope="col">${sectionReportSortHeader('Correct', 'correct')}</th>
                    <th scope="col">${sectionReportSortHeader('Partial', 'partial')}</th>
                    <th scope="col">${sectionReportSortHeader('Wrong', 'wrong')}</th>
                    <th scope="col">${sectionReportSortHeader('Most Wrong Option', 'wrongOption')}</th>
                    <th scope="col">${sectionReportSortHeader('Needs Review', 'pending')}</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        <th scope="row" class="analysis-text-cell">${esc(row.title)}</th>
                        <td>${esc(questionTypeLabel(row.type || 'unknown'))}</td>
                        <td class="analysis-text-cell">${esc(row.topic)}</td>
                        <td>${row.seenBy}</td>
                        <td>${row.avgPercent}%</td>
                        <td>${percentLabel(row.correct, row.total)}</td>
                        <td>${percentLabel(row.partial, row.total)}</td>
                        <td>${percentLabel(row.wrong, row.total)}</td>
                        <td class="analysis-text-cell">${esc(row.mostWrongOption || '-')}</td>
                        <td>${row.pending}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function sectionReportSortHeader(label, key) {
    const active = sectionReportSort.key === key;
    const direction = active ? sectionReportSort.direction === 'asc' ? 'ASC' : 'DESC' : 'SORT';
    return `<button class="sort-head-btn ${active ? 'active' : ''}" type="button" data-section-report-sort="${key}">${esc(label)} <span>${direction}</span></button>`;
}

function handleSectionReportSortClick(event) {
    const button = event.target.closest('[data-section-report-sort]');
    if (!button) return;
    const key = button.dataset.sectionReportSort;
    const defaultDirection = ['seen', 'avg', 'correct', 'partial', 'wrong', 'wrongOption', 'pending'].includes(key) ? 'desc' : 'asc';
    sectionReportSort = sectionReportSort.key === key
        ? { key, direction: sectionReportSort.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: defaultDirection };
    renderSectionQuestionReport();
}

function compareSectionQuestionReportRows(a, b) {
    const sort = sectionReportSort;
    let result = 0;
    if (sort.key === 'question') result = compareText(a.title, b.title);
    else if (sort.key === 'type') result = compareText(questionTypeLabel(a.type || 'unknown'), questionTypeLabel(b.type || 'unknown'));
    else if (sort.key === 'topic') result = compareText(a.topic, b.topic);
    else if (sort.key === 'seen') result = a.seenBy - b.seenBy;
    else if (sort.key === 'correct') result = a.correctPercent - b.correctPercent;
    else if (sort.key === 'partial') result = a.partialPercent - b.partialPercent;
    else if (sort.key === 'wrong') result = a.wrongPercent - b.wrongPercent;
    else if (sort.key === 'wrongOption') result = (a.mostWrongOptionCount - b.mostWrongOptionCount) || compareText(a.mostWrongOptionLabel, b.mostWrongOptionLabel);
    else if (sort.key === 'pending') result = a.pending - b.pending;
    else result = a.avgPercent - b.avgPercent;
    return sort.direction === 'asc' ? result : -result;
}

function buildQuestionColumns(items) {
    const columns = [];
    const seen = new Set();
    items.forEach(submission => {
        (submission.answers || []).forEach((answer, index) => {
            if (!matchesQuestionTypeFilter(answer)) return;
            const key = questionKeyForAnswer(answer, index);
            if (!key || seen.has(key)) return;
            seen.add(key);
            const questionText = questionTitleForAnswer(answer);
            columns.push({
                key,
                label: `Q${columns.length + 1}`,
                title: questionText || answer.questionId || `Question ${columns.length + 1}`
            });
        });
    });
    return columns;
}

function answerForQuestion(submission, questionKey) {
    const answers = submission.answers || [];
    const index = answers.findIndex((answer, answerIndex) => {
        return matchesQuestionTypeFilter(answer) && questionKeyForAnswer(answer, answerIndex) === questionKey;
    });
    return {
        answer: index === -1 ? null : answers[index],
        index
    };
}

function questionKeyForAnswer(answer, index) {
    if (!answer) return '';
    if (answer.questionId) return `id:${answer.questionId}`;
    const question = questionMetadataForAnswer(answer);
    const prompt = htmlToText(question?.promptHtml || answer.promptHtml || answer.prompt || '').trim().replace(/\s+/g, ' ');
    const correct = String(answer.correctAnswer || answer.expectedAnswer || '').trim().replace(/\s+/g, ' ');
    const type = String(question?.type || answer.type || '').trim();
    if (prompt || correct || type) return `sig:${type}::${prompt}::${correct}`;
    return `position:${index}`;
}

function questionTitleForAnswer(answer) {
    const question = questionMetadataForAnswer(answer);
    return htmlToText(question?.promptHtml || answer?.promptHtml || answer?.prompt || '').trim();
}

function studentTopicSummary(submission) {
    const topics = new Map();
    const answers = answersMatchingQuestionType(submission);
    answers.forEach(({ answer, index }) => {
        const label = topicLabelForAnswer(answer, submission);
        const type = normalizedQuestionType(answer);
        const stats = ensureTopicStats(topics, `${label}::${type}`, label, type);
        addAnswerToStats(stats, submission, answer, index);
    });
    const topicRows = Array.from(topics.values()).map(stats => ({
        label: stats.label,
        avg: stats.maxMarks ? Math.round((stats.earnedMarks / stats.maxMarks) * 100) : 0,
        attempted: stats.attempted
    })).filter(topic => topic.attempted > 0);
    return {
        total: answers.length,
        attempted: answers.filter(({ answer }) => answerResponseText(answer)).length,
        strongTopics: topicRows.filter(topic => topic.avg >= 75).sort((a, b) => b.avg - a.avg).slice(0, 3).map(topic => topic.label),
        weakTopics: topicRows.filter(topic => topic.avg < 50).sort((a, b) => a.avg - b.avg).slice(0, 3).map(topic => topic.label)
    };
}

function topicStats(items) {
    const topics = new Map();
    items.forEach(submission => {
        answersMatchingQuestionType(submission).forEach(({ answer, index }) => {
            const label = topicLabelForAnswer(answer, submission);
            const type = normalizedQuestionType(answer);
            const stats = ensureTopicStats(topics, `${label}::${type}`, label, type);
            addAnswerToStats(stats, submission, answer, index);
        });
    });
    topics.forEach(finalizeAnalysisStats);
    return topics;
}

function questionColumnStats(items, column) {
    const stats = createAnalysisStats(column.title);
    let topic = '';
    let type = '';
    items.forEach(submission => {
        const { answer, index } = answerForQuestion(submission, column.key);
        if (!answer) return;
        if (!topic) topic = topicLabelForAnswer(answer, submission);
        if (!type) type = normalizedQuestionType(answer);
        addAnswerToStats(stats, submission, answer, index);
    });
    finalizeAnalysisStats(stats);
    return {
        key: column.key,
        label: column.label,
        title: column.title,
        topic: topic || 'Unmapped',
        type,
        seenBy: stats.students.size,
        total: stats.total,
        avgPercent: stats.avgPercent,
        correct: stats.correct,
        partial: stats.partial,
        wrong: stats.wrong,
        pending: stats.pending
    };
}

function ensureTopicStats(topics, key, label, type) {
    if (!topics.has(key)) {
        const stats = createAnalysisStats(label);
        stats.type = type;
        topics.set(key, stats);
    }
    return topics.get(key);
}

function createAnalysisStats(label) {
    return {
        label,
        students: new Set(),
        total: 0,
        attempted: 0,
        earnedMarks: 0,
        maxMarks: 0,
        correct: 0,
        partial: 0,
        wrong: 0,
        pending: 0,
        avgPercent: 0
    };
}

function addAnswerToStats(stats, submission, answer, index) {
    stats.total += 1;
    stats.students.add(submission.studentKey || submission.id || `${submission.sectionId || ''}_${submission.admissionNo || ''}`);
    if (answerResponseText(answer)) stats.attempted += 1;
    const marks = answerMarks(submission, answer, index);
    if (marks === null) {
        stats.pending += 1;
        return;
    }
    stats.earnedMarks += marks;
    stats.maxMarks += 4;
    if (marks >= 4) stats.correct += 1;
    else if (marks > 0) stats.partial += 1;
    else stats.wrong += 1;
}

function finalizeAnalysisStats(stats) {
    stats.avgPercent = stats.maxMarks ? Math.round((stats.earnedMarks / stats.maxMarks) * 100) : 0;
    return stats;
}

function answerMarks(submission, answer, index) {
    const review = getAiReview(submission, answer, index);
    if (hasSavedAiReview(review)) return Number(review.marks || 0);
    if (answer?.isCorrect === true) return 4;
    if (answer?.isCorrect === false) return 0;
    return null;
}

function answersMatchingQuestionType(submission) {
    return (submission.answers || [])
        .map((answer, index) => ({ answer, index }))
        .filter(({ answer }) => matchesQuestionTypeFilter(answer));
}

function matchesQuestionTypeFilter(answer) {
    const selected = $('questionTypeFilter')?.value || '';
    return !selected || normalizedQuestionType(answer) === selected;
}

function normalizedQuestionType(answer) {
    const question = questionMetadataForAnswer(answer);
    const type = String(question?.type || answer?.type || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (type.includes('true') || type.includes('false')) return 'true_false';
    if (type.includes('short')) return 'short_answer';
    if (type.includes('fib') || type.includes('fill') || type.includes('blank')) return 'fib';
    if (type.includes('mcq') || type.includes('multiple') || type.includes('choice')) return 'mcq';
    return type || 'unknown';
}

function topicLabelForAnswer(answer, submission) {
    const question = questionMetadataForAnswer(answer);
    const taxonomyLabel = taxonomyPathLabel(question);
    if (taxonomyLabel) return taxonomyLabel;
    const answerTopics = [
        answer?.topic,
        answer?.topicName,
        answer?.learningOutcome,
        answer?.chapter,
        answer?.chapterName,
        answer?.subject
    ].filter(Boolean);
    if (answerTopics.length) return answerTopics.join(' / ');
    const chapters = Array.isArray(submission.chapters) ? submission.chapters.filter(Boolean).join(', ') : '';
    const subject = submission.subject || '';
    return [subject, chapters].filter(Boolean).join(' / ') || 'Unmapped';
}

function questionMetadataForAnswer(answer) {
    if (!answer?.questionId) return null;
    return questionMetadataById.get(answer.questionId) || null;
}

function taxonomyPathLabel(question) {
    if (!question) return '';
    const labels = [question.subjectId, question.chapterId, question.topicId]
        .map(id => taxonomyById.get(id)?.label)
        .filter(Boolean);
    return labels.join(' / ');
}

function percentLabel(count, total) {
    if (!total) return '0%';
    return `${Math.round((count / total) * 100)}%`;
}

function sortedStudentAnalysisRows(items) {
    return items
        .map(submission => ({ submission, summary: studentTopicSummary(submission) }))
        .sort(compareStudentAnalysisRows);
}

function analysisSortHeader(label, key) {
    const sort = analysisSort[submissionViewMode] || { key: '', direction: 'asc' };
    const active = sort.key === key;
    const direction = active ? sort.direction === 'asc' ? 'ASC' : 'DESC' : 'SORT';
    return `<button class="sort-head-btn ${active ? 'active' : ''}" type="button" data-analysis-sort="${key}">${esc(label)} <span>${direction}</span></button>`;
}

function setAnalysisSort(key) {
    const current = analysisSort[submissionViewMode] || { key: '', direction: 'asc' };
    const defaultDirection = ['avg', 'score', 'students', 'answers', 'seen', 'correct', 'partial', 'wrong', 'pending', 'review', 'attempted'].includes(key) ? 'desc' : 'asc';
    analysisSort[submissionViewMode] = current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: defaultDirection };
    renderSubmissions();
}

function compareStudentAnalysisRows(a, b) {
    const sort = analysisSort.students;
    let result = 0;
    if (sort.key === 'student') result = compareText(a.submission.studentName || 'Student', b.submission.studentName || 'Student');
    else if (sort.key === 'roll') result = compareText(a.submission.admissionNo || '', b.submission.admissionNo || '');
    else if (sort.key === 'attempted') result = a.summary.attempted - b.summary.attempted;
    else if (sort.key === 'review') result = manualCount(a.submission) - manualCount(b.submission);
    else {
        const aScore = scoreDetails(a.submission);
        const bScore = scoreDetails(b.submission);
        result = aScore.percent - bScore.percent || aScore.earnedMarks - bScore.earnedMarks;
    }
    return sort.direction === 'asc' ? result : -result;
}

function compareTopicRows(a, b) {
    const sort = analysisSort.topics;
    let result = 0;
    if (sort.key === 'topic') result = compareText(a.label, b.label);
    else if (sort.key === 'type') result = compareText(questionTypeLabel(a.type || 'mixed'), questionTypeLabel(b.type || 'mixed'));
    else if (sort.key === 'students') result = a.students.size - b.students.size;
    else if (sort.key === 'answers') result = a.total - b.total;
    else if (sort.key === 'correct') result = percentValue(a.correct, a.total) - percentValue(b.correct, b.total);
    else if (sort.key === 'partial') result = percentValue(a.partial, a.total) - percentValue(b.partial, b.total);
    else if (sort.key === 'wrong') result = percentValue(a.wrong, a.total) - percentValue(b.wrong, b.total);
    else if (sort.key === 'pending') result = a.pending - b.pending;
    else result = a.avgPercent - b.avgPercent;
    return sort.direction === 'asc' ? result : -result;
}

function compareQuestionRows(a, b) {
    const sort = analysisSort.questions;
    let result = 0;
    if (sort.key === 'question') result = compareText(a.title, b.title);
    else if (sort.key === 'type') result = compareText(questionTypeLabel(a.type || 'unknown'), questionTypeLabel(b.type || 'unknown'));
    else if (sort.key === 'topic') result = compareText(a.topic, b.topic);
    else if (sort.key === 'seen') result = a.seenBy - b.seenBy;
    else if (sort.key === 'correct') result = percentValue(a.correct, a.total) - percentValue(b.correct, b.total);
    else if (sort.key === 'partial') result = percentValue(a.partial, a.total) - percentValue(b.partial, b.total);
    else if (sort.key === 'wrong') result = percentValue(a.wrong, a.total) - percentValue(b.wrong, b.total);
    else if (sort.key === 'pending') result = a.pending - b.pending;
    else result = a.avgPercent - b.avgPercent;
    return sort.direction === 'asc' ? result : -result;
}

function percentValue(count, total) {
    return total ? count / total : 0;
}

function sortHeader(label, key) {
    const active = submissionSort.key === key;
    const direction = active ? submissionSort.direction === 'asc' ? 'ASC' : 'DESC' : 'SORT';
    return `<button class="sort-head-btn ${active ? 'active' : ''}" type="button" data-submission-sort="${key}">${esc(label)} <span>${direction}</span></button>`;
}

function setSubmissionSort(key) {
    if (submissionSort.key === key) {
        submissionSort = { key, direction: submissionSort.direction === 'asc' ? 'desc' : 'asc' };
    } else {
        submissionSort = { key, direction: key === 'score' || key === 'review' ? 'desc' : 'asc' };
    }
    renderSubmissions();
}

function sortedSubmissions(items) {
    return [...items].sort((a, b) => {
        const result = compareSubmissions(a, b, submissionSort.key);
        return submissionSort.direction === 'asc' ? result : -result;
    });
}

function compareSubmissions(a, b, key) {
    if (key === 'student') return compareText(a.studentName || 'Student', b.studentName || 'Student');
    if (key === 'roll') return compareText(a.admissionNo || '', b.admissionNo || '');
    if (key === 'review') return manualCount(a) - manualCount(b);
    if (key === 'score') {
        const scoreDiff = scoreDetails(a).earnedMarks - scoreDetails(b).earnedMarks;
        if (scoreDiff) return scoreDiff;
        return scoreDetails(a).percent - scoreDetails(b).percent;
    }
    return (a.submittedAtMillis || 0) - (b.submittedAtMillis || 0);
}

function compareText(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function answerCell(answer) {
    const state = answerState(answer);
    return `<td class="answer-cell ${state.className}" title="${esc(state.title)}">${esc(state.label)}</td>`;
}

function openQuestionDetail(questionKey) {
    const visible = sortedSubmissions(filteredSubmissions());
    const column = buildQuestionColumns(visible).find(item => item.key === questionKey);
    if (!column) return;
    const responses = visible.map(submission => {
        const { answer, index } = answerForQuestion(submission, questionKey);
        return { submission, answer, index };
    });
    const answer = responses.map(item => item.answer).find(Boolean);
    if (!answer) return;
    const answered = responses.filter(item => item.answer);
    const correct = answered.filter(item => item.answer.isCorrect === true).length;
    const wrong = answered.filter(item => item.answer.isCorrect === false).length;
    const manual = answered.filter(item => item.answer && item.answer.isCorrect !== true && item.answer.isCorrect !== false).length;

    els.questionDetailTitle.textContent = column.label;
    els.questionDetailMeta.textContent = `${correct} correct · ${wrong} wrong · ${manual} manual · ${visible.length - answered.length} missing`;
    els.questionPrompt.innerHTML = `
        <div class="rich-content">${sanitizeRich(answer.promptHtml || '')}</div>
        <div><strong>Correct answer:</strong> ${esc(answer.correctAnswer || 'Teacher review')}</div>
        <div class="answer-footer">
            <span>${esc(answer.type || '')}</span>
            ${answer.questionId ? `<span>${esc(answer.questionId)}</span>` : ''}
        </div>
    `;
    activeQuestionReview = { index: Number(column.label.replace('Q', '')) - 1, label: column.label, answer, responses };
    initializeAiReviewSelection();
    updateAiReviewControls();
    renderQuestionResponses();
    renderRich(els.questionPrompt);
    els.questionDialog.showModal();
}

function updateAiReviewControls(message = '') {
    if (!activeQuestionReview) return;
    const reviewable = reviewableResponsesForActiveQuestion({ pendingOnly: false }).length;
    const selected = selectedAiReviewResponsesForActiveQuestion().length;
    const hasKey = !!loadGeminiKey();
    const aiReviewBtnLabel = els.aiReviewBtn.querySelector('.btn-label');
    els.aiReviewBtn.disabled = aiReviewInFlight || selected === 0;
    els.aiReviewBtn.classList.toggle('is-loading', aiReviewInFlight);
    els.aiReviewBtn.setAttribute('aria-busy', String(aiReviewInFlight));
    if (aiReviewBtnLabel) {
        aiReviewBtnLabel.textContent = aiReviewInFlight ? 'Reviewing...' : 'Review With Gemini';
    }
    els.saveAiReviewOverridesBtn.disabled = reviewable === 0;
    els.selectAllAiReviewBtn.disabled = aiReviewInFlight || reviewable === 0;
    els.clearAiReviewSelectionBtn.disabled = aiReviewInFlight || selected === 0;
    if (message) {
        els.aiReviewStatus.textContent = message;
    } else if (!reviewable) {
        els.aiReviewStatus.textContent = 'Gemini review is available for FIB and short-answer questions only.';
    } else {
        els.aiReviewStatus.textContent = `${selected} of ${reviewable} response${reviewable === 1 ? '' : 's'} selected for AI review. ${hasKey ? 'Gemini key saved.' : 'Add your Gemini key before reviewing.'}`;
    }
}

function renderQuestionResponses() {
    if (!activeQuestionReview) return;
    els.questionResponseList.innerHTML = questionResponsesForDisplay().map(({ submission, answer: itemAnswer, index }) => {
        const state = answerState(itemAnswer);
        const statusLabel = answerStatusLabel(itemAnswer);
        const responseText = answerResponseText(itemAnswer);
        const reviewable = isReviewableAnswer(itemAnswer);
        const key = reviewKey(submission, itemAnswer, index);
        const review = getAiReview(submission, itemAnswer, index);
        const selected = reviewable && selectedAiReviewKeys.has(key);
        return `
            <article class="question-response-row ai-response-row" data-review-key="${esc(key)}">
                <label class="ai-select-cell" title="Select for Gemini review">
                    <input class="ai-review-select" type="checkbox" ${selected ? 'checked' : ''} ${reviewable ? '' : 'disabled'} />
                    <span>Select</span>
                </label>
                <div class="question-response-main">
                    <div>
                        <strong>${esc(submission.studentName || 'Student')}</strong>
                        <p>${esc(submission.admissionNo || '')}</p>
                    </div>
                    <div class="exact-response">
                        <span>Exact response</span>
                        <p>${esc(responseText || 'Not answered')}</p>
                    </div>
                </div>
                <span class="answer-pill ${state.className}">${esc(statusLabel)}</span>
                <div class="ai-score-editor">
                    <label class="field compact-field">
                        <span>Marks (0-4)</span>
                        <input class="review-marks" type="number" min="0" max="4" step="1" value="${review?.marks ?? ''}" ${reviewable ? '' : 'disabled'} />
                    </label>
                    <label class="field compact-field">
                        <span>Reason</span>
                        <textarea class="review-reason" rows="2" ${reviewable ? '' : 'disabled'}>${esc(review?.reason || '')}</textarea>
                    </label>
                    <p class="review-source">${review ? esc(review.source === 'teacher' ? 'Teacher override saved' : 'AI generated score') : reviewable ? 'Not reviewed yet' : 'AI review not available for this answer type'}</p>
                </div>
            </article>
        `;
    }).join('');
    updateAiReviewControls();
}

function questionResponsesForDisplay() {
    if (!activeQuestionReview) return [];
    const { responses } = activeQuestionReview;
    const items = responses.filter(({ answer }) => isReviewableAnswer(answer));
    if (!els.sortQuestionByMarksDesc.checked) return items;
    return items.sort((a, b) => {
        const aMarks = reviewMarksForSort(getAiReview(a.submission, a.answer, a.index));
        const bMarks = reviewMarksForSort(getAiReview(b.submission, b.answer, b.index));
        if (bMarks !== aMarks) return bMarks - aMarks;
        return String(a.submission.studentName || '').localeCompare(String(b.submission.studentName || ''), undefined, { sensitivity: 'base' });
    });
}

function reviewMarksForSort(review) {
    return hasSavedAiReview(review) ? Number(review.marks) : -1;
}

function filteredSubmissions() {
    const student = $('studentSearch').value.trim().toLowerCase();
    const subject = $('subjectFilter').value.trim().toLowerCase();
    const chapter = $('chapterFilter').value.trim().toLowerCase();
    const result = $('resultFilter').value;
    const questionType = $('questionTypeFilter').value;
    return submissions.filter(s => {
        if (student && ![s.studentName, s.admissionNo, s.studentKey].some(value => String(value || '').toLowerCase().includes(student))) return false;
        if (subject && !String(s.subject || '').toLowerCase().includes(subject)) return false;
        if (chapter && !(s.chapters || []).some(value => String(value || '').toLowerCase().includes(chapter))) return false;
        if (questionType && !answersMatchingQuestionType(s).length) return false;
        if (result === 'passed' && scorePercent(s) < 50) return false;
        if (result === 'needs_review' && scorePercent(s) >= 50 && manualCount(s) === 0) return false;
        if (result === 'manual' && manualCount(s) === 0) return false;
        if (result === 'ai_pending' && !hasPendingAiReview(s)) return false;
        return true;
    });
}

function submissionCard(s) {
    const percent = scorePercent(s);
    return `
        <article class="submission-card">
            <div class="submission-head">
                <div>
                    <strong>${esc(s.studentName || 'Student')}</strong>
                    <p>${esc(s.admissionNo || '')} · ${formatDate(s.submittedAtMillis)}</p>
                </div>
                <span class="count-chip">${percent}%</span>
            </div>
            <div class="score-bar"><div class="score-fill" style="width:${Math.max(0, Math.min(100, percent))}%"></div></div>
            <div class="submission-meta">
                <span>${s.correctCount || 0}/${s.gradableCount || 0} auto-graded</span>
                <span>${s.answeredCount || 0}/${s.questionCount || 0} answered</span>
                <span>${esc(s.subject || 'Any subject')}</span>
                <span>${esc((s.chapters || []).join(', ') || 'Any chapter')}</span>
                ${manualCount(s) ? `<span class="meta-chip manual">${manualCount(s)} manual</span>` : ''}
            </div>
            <button class="btn" data-detail="${s.id}">View Details</button>
        </article>
    `;
}

function openSubmissionDetail(id) {
    const s = submissions.find(item => item.id === id);
    if (!s) return;
    els.detailTitle.textContent = s.studentName || 'Submission Details';
    els.detailMeta.textContent = `${s.admissionNo || ''} · ${formatDate(s.submittedAtMillis)} · ${s.subject || 'Any subject'}`;
    els.detailStats.innerHTML = `
        <div class="stat-card"><span>Score</span><strong>${scorePercent(s)}%</strong></div>
        <div class="stat-card"><span>Correct</span><strong>${s.correctCount || 0}</strong></div>
        <div class="stat-card"><span>Answered</span><strong>${s.answeredCount || 0}</strong></div>
        <div class="stat-card"><span>Manual</span><strong>${manualCount(s)}</strong></div>
    `;
    els.answerDetails.innerHTML = (s.answers || []).map((answer, index) => `
        <article class="answer-card">
            <div class="answer-head">
                <strong>Question ${index + 1}</strong>
                ${answer.isCorrect === null ? '<span class="meta-chip manual">Manual Review</span>' : answer.isCorrect ? '<span class="meta-chip correct">Correct</span>' : '<span class="meta-chip wrong">Incorrect</span>'}
            </div>
            <div class="rich-content">${sanitizeRich(answer.promptHtml || '')}</div>
            <div><strong>Student answer:</strong> ${esc(answer.displayAnswer || answer.shortAnswer || 'Not answered')}</div>
            <div><strong>Correct answer:</strong> ${esc(answer.correctAnswer || 'Teacher review')}</div>
            <div class="answer-footer">
                <span>${esc(answer.type || '')}</span>
                ${answer.selectedOptions?.length ? `<span>Selected indexes: ${answer.selectedOptions.join(', ')}</span>` : ''}
                ${answer.fibAnswers?.length ? `<span>FIB: ${esc(answer.fibAnswers.join(', '))}</span>` : ''}
            </div>
        </article>
    `).join('');
    renderRich(els.answerDetails);
    els.detailDialog.showModal();
}

async function openStudentReport(submissionId) {
    const seed = submissions.find(item => item.id === submissionId);
    if (!seed) return;
    activeStudentReport = { seed, history: [], subject: '' };
    els.studentReportTitle.textContent = seed.studentName || 'Student Report';
    els.studentReportMeta.textContent = `${seed.admissionNo || ''} · Loading performance history...`;
    els.studentReportSubjectFilter.innerHTML = '<option value="">All subjects</option>';
    els.studentReportSummary.innerHTML = '<div class="empty-card">Loading student report...</div>';
    els.studentReportInsights.innerHTML = '';
    els.studentReportTrend.innerHTML = '';
    els.studentReportSubjectTable.innerHTML = '';
    els.studentReportTypeTable.innerHTML = '';
    els.studentReportTopicTable.innerHTML = '';
    els.studentReportRecentTable.innerHTML = '';
    els.studentReportDialog.showModal();
    try {
        const history = await getSubmissionHistoryForStudent(seed);
        await loadQuestionMetadataForSubmissions(history);
        activeStudentReport = { seed, history, subject: '' };
        renderStudentReportSubjectOptions(history);
        renderStudentReport();
    } catch (error) {
        els.studentReportMeta.textContent = error.message || 'Unable to load student report';
        els.studentReportSummary.innerHTML = '<div class="empty-card">Unable to load this student report.</div>';
    }
}

async function getSubmissionHistoryForStudent(seed) {
    const sectionId = seed.sectionId || findClassroom(activeClassroomId)?.sectionId || '';
    const byId = new Map();
    submissions.forEach(submission => byId.set(submission.id, submission));
    if (sectionId) {
        const snap = await getDocs(query(collection(db, COLLECTIONS.submissions), where('sectionId', '==', sectionId)));
        snap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
    }
    return Array.from(byId.values())
        .filter(submission => studentMatchesSubmission(seed, submission))
        .sort((a, b) => (b.submittedAtMillis || 0) - (a.submittedAtMillis || 0));
}

function studentMatchesSubmission(seed, submission) {
    const seedAdmission = String(seed.admissionNo || '').trim();
    const admission = String(submission.admissionNo || '').trim();
    const seedKey = String(seed.studentKey || '').trim();
    const key = String(submission.studentKey || '').trim();
    const seedName = String(seed.studentName || '').trim().toLowerCase();
    const name = String(submission.studentName || '').trim().toLowerCase();
    if (seedAdmission && admission === seedAdmission) return true;
    if (seedKey && key === seedKey) return true;
    if (seedAdmission && key.endsWith(`_${seedAdmission}`)) return true;
    if (seedKey && admission && seedKey.endsWith(`_${admission}`)) return true;
    return !!seedName && seedName === name && (!seed.sectionId || seed.sectionId === submission.sectionId);
}

function renderStudentReportSubjectOptions(history) {
    const subjects = Array.from(new Set(history.map(submission => submission.subject || 'Any subject')))
        .sort((a, b) => compareText(a, b));
    els.studentReportSubjectFilter.innerHTML = `
        <option value="">All subjects</option>
        ${subjects.map(subject => `<option value="${esc(subject)}">${esc(subject)}</option>`).join('')}
    `;
}

function renderStudentReport() {
    if (!activeStudentReport) return;
    activeStudentReport.subject = els.studentReportSubjectFilter.value;
    const { seed, history } = activeStudentReport;
    const items = history.filter(submission => {
        const subject = submission.subject || 'Any subject';
        return !activeStudentReport.subject || subject === activeStudentReport.subject;
    });
    const metrics = studentReportMetrics(items);
    els.studentReportTitle.textContent = seed.studentName || 'Student Report';
    els.studentReportMeta.textContent = `${seed.admissionNo || ''} · ${items.length} of ${history.length} submission${history.length === 1 ? '' : 's'} shown`;
    els.studentReportSummary.innerHTML = `
        <div class="stat-card"><span>Average</span><strong>${metrics.average}%</strong></div>
        <div class="stat-card"><span>Best</span><strong>${metrics.best}%</strong></div>
        <div class="stat-card"><span>Latest</span><strong>${metrics.latest}%</strong></div>
        <div class="stat-card"><span>Pending Review</span><strong>${metrics.pending}</strong></div>
    `;
    els.studentReportInsights.innerHTML = studentReportInsightsHtml(items);
    els.studentReportTrend.innerHTML = studentReportTrendHtml(items);
    els.studentReportSubjectTable.innerHTML = studentReportSubjectTableHtml(items);
    els.studentReportTypeTable.innerHTML = studentReportTypeTableHtml(items);
    els.studentReportTopicTable.innerHTML = studentReportTopicTableHtml(items);
    els.studentReportRecentTable.innerHTML = studentReportRecentTableHtml(items);
}

function studentReportMetrics(items) {
    const scored = items.filter(submission => scoreDetails(submission).maxMarks > 0);
    const average = scored.length
        ? Math.round(scored.reduce((sum, submission) => sum + scoreDetails(submission).percent, 0) / scored.length)
        : 0;
    return {
        average,
        best: scored.length ? Math.max(...scored.map(submission => scoreDetails(submission).percent)) : 0,
        latest: scored.length ? scoreDetails(scored[0]).percent : 0,
        pending: items.reduce((sum, submission) => sum + manualCount(submission), 0)
    };
}

function studentReportInsightsHtml(items) {
    if (!items.length) return '<div class="empty-card">No submissions match this subject filter.</div>';
    const topics = Array.from(studentReportTopicStats(items).values()).sort((a, b) => a.avgPercent - b.avgPercent);
    const types = Array.from(studentReportTypeStats(items).values()).sort((a, b) => a.avgPercent - b.avgPercent);
    const weakTopics = topics.filter(topic => topic.total >= 2 && topic.avgPercent < 50).slice(0, 3).map(topic => topic.label);
    const strongTopics = topics.filter(topic => topic.total >= 2 && topic.avgPercent >= 75).sort((a, b) => b.avgPercent - a.avgPercent).slice(0, 3).map(topic => topic.label);
    const weakestType = types.find(type => type.total > 0);
    const pending = items.reduce((sum, submission) => sum + manualCount(submission), 0);
    const insights = [
        strongTopics.length ? `Strengths: ${strongTopics.join(', ')}.` : 'Strengths: not enough repeated high-scoring topic data yet.',
        weakTopics.length ? `Needs practice: ${weakTopics.join(', ')}.` : 'Needs practice: no repeated low-scoring topic pattern detected.',
        weakestType ? `Question type watch: ${questionTypeLabel(weakestType.type)} averages ${weakestType.avgPercent}%.` : '',
        pending ? `${pending} answer${pending === 1 ? '' : 's'} still need manual or AI review.` : 'No pending manual review in the selected submissions.'
    ].filter(Boolean);
    return `<div class="student-insight-list">${insights.map(item => `<p>${esc(item)}</p>`).join('')}</div>`;
}

function studentReportTrendHtml(items) {
    const trend = [...items].sort((a, b) => (a.submittedAtMillis || 0) - (b.submittedAtMillis || 0));
    if (!trend.length) return '<div class="empty-card">No trend data available.</div>';
    return `
        <h3>Performance Trend</h3>
        <div class="student-trend">
            ${trend.map(submission => {
                const percent = scorePercent(submission);
                return `
                    <div class="trend-point" title="${esc(formatDate(submission.submittedAtMillis))} · ${percent}%">
                        <span>${percent}%</span>
                        <div class="trend-bar"><i style="height:${Math.max(4, Math.min(100, percent))}%"></i></div>
                        <small>${esc(shortDate(submission.submittedAtMillis))}</small>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function studentReportSubjectTableHtml(items) {
    const rows = Array.from(studentReportSubjectStats(items).values());
    return studentReportSimpleTable('Subject Summary', 'subjects', [
        { key: 'subject', label: 'Subject', value: row => row.subject },
        { key: 'sessions', label: 'Sessions', value: row => row.sessions },
        { key: 'avg', label: 'Avg', value: row => `${row.avgPercent}%`, sortValue: row => row.avgPercent },
        { key: 'best', label: 'Best', value: row => `${row.bestPercent}%`, sortValue: row => row.bestPercent },
        { key: 'pending', label: 'Pending', value: row => row.pending }
    ], rows);
}

function studentReportTypeTableHtml(items) {
    const rows = Array.from(studentReportTypeStats(items).values());
    return studentReportSimpleTable('Question Type Breakdown', 'types', [
        { key: 'type', label: 'Type', value: row => questionTypeLabel(row.type) },
        { key: 'attempted', label: 'Attempted', value: row => row.attempted },
        { key: 'avg', label: 'Avg', value: row => `${row.avgPercent}%`, sortValue: row => row.avgPercent },
        { key: 'correct', label: 'Correct', value: row => percentLabel(row.correct, row.total), sortValue: row => percentValue(row.correct, row.total) },
        { key: 'pending', label: 'Pending', value: row => row.pending }
    ], rows);
}

function studentReportTopicTableHtml(items) {
    const rows = Array.from(studentReportTopicStats(items).values());
    return studentReportSimpleTable('Topic / Chapter Mastery', 'topics', [
        { key: 'topic', label: 'Topic', value: row => row.label },
        { key: 'attempted', label: 'Attempted', value: row => row.attempted },
        { key: 'avg', label: 'Avg', value: row => `${row.avgPercent}%`, sortValue: row => row.avgPercent },
        { key: 'difficulty', label: 'Difficulty Mix', value: row => difficultyMixLabel(row.difficulties) },
        { key: 'status', label: 'Status', value: row => masteryStatus(row), sortValue: row => masteryStatusRank(row) }
    ], rows);
}

function studentReportRecentTableHtml(items) {
    return studentReportSimpleTable('Recent Submissions', 'recent', [
        { key: 'date', label: 'Date', value: row => formatDate(row.submittedAtMillis) || '-', sortValue: row => row.submittedAtMillis || 0 },
        { key: 'session', label: 'Quiz Session', value: row => quizSessionLabel(row) },
        { key: 'subject', label: 'Subject', value: row => row.subject || 'Any subject' },
        { key: 'score', label: 'Score', value: row => scoreLabel(row), sortValue: row => scorePercent(row) },
        { key: 'review', label: 'Review', value: row => manualCount(row), sortValue: row => manualCount(row) }
    ], items, { limit: 12 });
}

function studentReportSimpleTable(title, tableKey, columns, rows, options = {}) {
    if (!rows.length) return `<h3>${esc(title)}</h3><div class="empty-card">No data available.</div>`;
    const sortedRows = sortedStudentReportRows(tableKey, columns, rows).slice(0, options.limit || rows.length);
    return `
        <h3>${esc(title)}</h3>
        <div class="student-report-table-wrap">
            <table class="student-report-table">
                <thead>
                    <tr>${columns.map(column => `<th scope="col">${studentReportSortHeader(tableKey, column)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${sortedRows.map(row => `
                        <tr>${columns.map((column, index) => {
                            const tag = index === 0 ? 'th scope="row"' : 'td';
                            return `<${tag}>${esc(column.value(row))}</${index === 0 ? 'th' : 'td'}>`;
                        }).join('')}</tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function sortedStudentReportRows(tableKey, columns, rows) {
    const sort = studentReportSort[tableKey];
    const column = columns.find(item => item.key === sort?.key) || columns[0];
    const valueForSort = column.sortValue || column.value;
    return [...rows].sort((a, b) => {
        const aValue = valueForSort(a);
        const bValue = valueForSort(b);
        const result = typeof aValue === 'number' && typeof bValue === 'number'
            ? aValue - bValue
            : compareText(aValue, bValue);
        return sort?.direction === 'desc' ? -result : result;
    });
}

function studentReportSortHeader(tableKey, column) {
    const sort = studentReportSort[tableKey];
    const active = sort?.key === column.key;
    const direction = active ? sort.direction === 'asc' ? 'ASC' : 'DESC' : 'SORT';
    return `<button class="sort-head-btn ${active ? 'active' : ''}" type="button" data-student-report-table="${esc(tableKey)}" data-student-report-sort="${esc(column.key)}">${esc(column.label)} <span>${direction}</span></button>`;
}

function handleStudentReportSortClick(event) {
    const button = event.target.closest('[data-student-report-sort]');
    if (!button) return;
    const tableKey = button.dataset.studentReportTable;
    const key = button.dataset.studentReportSort;
    if (!tableKey || !key) return;
    const current = studentReportSort[tableKey] || { key: '', direction: 'asc' };
    const defaultDirection = ['sessions', 'attempted', 'avg', 'best', 'correct', 'pending', 'date', 'score', 'review'].includes(key) ? 'desc' : 'asc';
    studentReportSort[tableKey] = current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: defaultDirection };
    renderStudentReport();
}

function studentReportSubjectStats(items) {
    const subjects = new Map();
    items.forEach(submission => {
        const subject = submission.subject || 'Any subject';
        if (!subjects.has(subject)) {
            subjects.set(subject, { subject, sessions: 0, totalPercent: 0, bestPercent: 0, pending: 0 });
        }
        const stats = subjects.get(subject);
        const percent = scorePercent(submission);
        stats.sessions += 1;
        stats.totalPercent += percent;
        stats.bestPercent = Math.max(stats.bestPercent, percent);
        stats.pending += manualCount(submission);
    });
    subjects.forEach(stats => {
        stats.avgPercent = stats.sessions ? Math.round(stats.totalPercent / stats.sessions) : 0;
    });
    return subjects;
}

function studentReportTopicStats(items) {
    const topics = new Map();
    items.forEach(submission => {
        (submission.answers || []).forEach((answer, index) => {
            const label = topicLabelForAnswer(answer, submission);
            const stats = ensureTopicStats(topics, label, label, 'mixed');
            addAnswerToStats(stats, submission, answer, index);
            const difficulty = answerDifficultyLabel(answer);
            stats.difficulties = stats.difficulties || {};
            stats.difficulties[difficulty] = (stats.difficulties[difficulty] || 0) + 1;
        });
    });
    topics.forEach(finalizeAnalysisStats);
    return topics;
}

function studentReportTypeStats(items) {
    const types = new Map();
    items.forEach(submission => {
        (submission.answers || []).forEach((answer, index) => {
            const type = normalizedQuestionType(answer);
            const stats = ensureTopicStats(types, type, questionTypeLabel(type), type);
            addAnswerToStats(stats, submission, answer, index);
        });
    });
    types.forEach(finalizeAnalysisStats);
    return types;
}

function answerDifficultyLabel(answer) {
    const question = questionMetadataForAnswer(answer);
    return question?.difficulty || answer?.difficulty || 'Unspecified';
}

function difficultyMixLabel(difficulties = {}) {
    return Object.entries(difficulties)
        .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
        .map(([label, count]) => `${label} ${count}`)
        .join(', ') || '-';
}

function masteryStatus(row) {
    if (row.attempted < 2) return 'Insufficient Data';
    if (row.avgPercent >= 75) return 'Strong';
    if (row.avgPercent >= 50) return 'Watch';
    return 'Needs Practice';
}

function masteryStatusRank(row) {
    const status = masteryStatus(row);
    if (status === 'Needs Practice') return 0;
    if (status === 'Watch') return 1;
    if (status === 'Strong') return 2;
    return 3;
}

function quizSessionLabel(submission) {
    const classroom = findClassroom(submission.classroomId);
    return classroom?.className || submission.className || submission.classroomName || submission.classroomId || 'Quiz session';
}

function shortDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function openExportDialog() {
    const settings = loadExportSettings();
    els.exportFieldList.innerHTML = EXPORT_FIELDS.map(field => `
        <label class="check-field">
            <input type="checkbox" value="${field.id}" ${settings.fieldIds.includes(field.id) ? 'checked' : ''} />
            <span>${esc(field.label)}</span>
        </label>
    `).join('');
    els.includeQuestionResponses.checked = settings.includeQuestionResponses;
    els.exportDialog.showModal();
}

function exportSubmissionsCsv(event) {
    event.preventDefault();
    const fieldIds = Array.from(els.exportFieldList.querySelectorAll('input:checked')).map(input => input.value);
    if (!fieldIds.length && !els.includeQuestionResponses.checked) {
        toast('Select at least one export field');
        return;
    }
    const settings = {
        fieldIds,
        includeQuestionResponses: els.includeQuestionResponses.checked
    };
    saveExportSettings(settings);

    const selectedFields = EXPORT_FIELDS.filter(field => fieldIds.includes(field.id));
    const exportedSubmissions = filteredSubmissions();
    const rows = [[...selectedFields.map(field => field.header)]];
    if (settings.includeQuestionResponses) {
        const maxAnswers = exportedSubmissions.reduce((max, s) => Math.max(max, (s.answers || []).length), 0);
        for (let index = 0; index < maxAnswers; index += 1) {
            rows[0].push(`question${index + 1}Response`);
        }
    }
    const classroom = findClassroom(activeClassroomId) || {};
    exportedSubmissions.forEach(s => {
        const row = selectedFields.map(field => field.value(s, classroom));
        if (settings.includeQuestionResponses) {
            const responseCount = rows[0].length - selectedFields.length;
            for (let index = 0; index < responseCount; index += 1) {
                row.push(answerResponseText((s.answers || [])[index]));
            }
        }
        rows.push(row);
    });
    els.exportDialog.close();
    downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), 'teacher-quiz-submissions.csv');
}

function loadExportSettings() {
    const defaults = {
        fieldIds: EXPORT_FIELDS.map(field => field.id),
        includeQuestionResponses: false
    };
    try {
        const parsed = JSON.parse(localStorage.getItem(EXPORT_SETTINGS_KEY) || 'null');
        if (!parsed || !Array.isArray(parsed.fieldIds)) return defaults;
        const validFieldIds = parsed.fieldIds.filter(id => EXPORT_FIELDS.some(field => field.id === id));
        return {
            fieldIds: validFieldIds.length ? validFieldIds : defaults.fieldIds,
            includeQuestionResponses: parsed.includeQuestionResponses === true
        };
    } catch {
        return defaults;
    }
}

function saveExportSettings(settings) {
    localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(settings));
}

function openGeminiDialog() {
    const key = loadGeminiKey();
    els.geminiApiKey.value = key;
    els.geminiKeyStatus.textContent = key
        ? 'A Gemini key is saved in this browser. Paste a new one to change it.'
        : 'Save a key in this browser to review FIB and short answers.';
    els.removeGeminiKeyBtn.hidden = !key;
    els.geminiDialog.showModal();
}

function saveGeminiKey(event) {
    event.preventDefault();
    const key = els.geminiApiKey.value.trim();
    if (!key) {
        toast('Paste a Gemini API key first');
        return;
    }
    localStorage.setItem(GEMINI_KEY_STORAGE_KEY, key);
    els.geminiDialog.close();
    updateAiReviewControls('Gemini key saved. You can review FIB and short answers now.');
    toast('Gemini key saved');
}

function removeGeminiKey() {
    localStorage.removeItem(GEMINI_KEY_STORAGE_KEY);
    els.geminiApiKey.value = '';
    els.removeGeminiKeyBtn.hidden = true;
    els.geminiKeyStatus.textContent = 'No Gemini key is saved in this browser.';
    updateAiReviewControls();
    toast('Gemini key removed');
}

function loadGeminiKey() {
    return localStorage.getItem(GEMINI_KEY_STORAGE_KEY) || '';
}

async function reviewActiveQuestionWithGemini() {
    if (!activeQuestionReview) return;
    if (aiReviewInFlight) return;
    const key = loadGeminiKey();
    if (!key) {
        openGeminiDialog();
        toast('Add your Gemini key first');
        return;
    }

    const reviewableResponses = selectedAiReviewResponsesForActiveQuestion();
    const rows = reviewableResponses
        .map(({ submission, answer }) => ({
            submissionId: submission.id,
            studentName: submission.studentName || 'Student',
            admissionNo: submission.admissionNo || '',
            exactResponse: answerResponseText(answer)
        }));
    if (!rows.length) {
        updateAiReviewControls('Select at least one unreviewed or reviewed response to send to Gemini.');
        return;
    }

    aiReviewInFlight = true;
    updateAiReviewControls('Reviewing with Gemini...');
    try {
        const prompt = buildGeminiReviewPrompt(
            activeQuestionReview.answer,
            activeQuestionReview.index,
            rows,
            els.useAiAnswerForReview.checked
        );
        const result = await callGeminiReview(key, prompt);
        const validIds = new Set(rows.map(row => row.submissionId));
        const writes = [];
        (result.reviews || []).forEach(review => {
            if (!validIds.has(review.submissionId)) return;
            const response = reviewableResponses.find(item => item.submission.id === review.submissionId);
            if (!response) return;
            const marks = normalizeMarks(review.marks);
            const reason = String(review.reason || '').trim();
            if (marks === null || !reason) return;
            writes.push(persistAiReviewForResponse(response, {
                marks,
                reason,
                source: 'ai',
                answerSource: els.useAiAnswerForReview.checked ? 'ai' : 'teacher',
                reviewedByUid: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                updatedAt: Date.now()
            }));
        });
        const writeResults = await Promise.all(writes);
        const savedCount = writeResults.filter(Boolean).length;
        selectedAiReviewKeys.clear();
        saveAiReviews();
        renderQuestionResponses();
        renderSelectedClassroom();
        renderSubmissions();
        updateAiReviewControls(`Gemini reviewed and saved ${savedCount} response${savedCount === 1 ? '' : 's'} to Firestore. You can overwrite any score.`);
    } catch (error) {
        updateAiReviewControls(error.message || 'Gemini review failed. Check the key and try again.');
        toast('Gemini review failed');
    } finally {
        aiReviewInFlight = false;
        updateAiReviewControls(els.aiReviewStatus.textContent);
    }
}

async function saveAiReviewOverrides() {
    if (!activeQuestionReview) return;
    const writes = [];
    els.questionResponseList.querySelectorAll('[data-review-key]').forEach(row => {
        const key = row.dataset.reviewKey;
        if (!key) return;
        const response = activeQuestionReview.responses.find(item => {
            return reviewKey(item.submission, item.answer, item.index) === key;
        });
        if (!response) return;
        const marksInput = row.querySelector('.review-marks');
        const reasonInput = row.querySelector('.review-reason');
        if (!marksInput || marksInput.disabled) return;
        const marks = normalizeMarks(marksInput.value);
        const reason = reasonInput.value.trim();
        if (marks === null && !reason) return;
        if (marks === null || !reason) {
            toast('Each saved review needs marks and a reason');
            return;
        }
        writes.push(persistAiReviewForResponse(response, {
            marks,
            reason,
            source: 'teacher',
            answerSource: els.useAiAnswerForReview.checked ? 'ai' : 'teacher',
            reviewedByUid: currentUser.uid,
            reviewedByEmail: currentUser.email || '',
            updatedAt: Date.now()
        }));
    });
    try {
        const writeResults = await Promise.all(writes);
        const savedCount = writeResults.filter(Boolean).length;
        saveAiReviews();
        renderQuestionResponses();
        renderSelectedClassroom();
        renderSubmissions();
        updateAiReviewControls(`Saved ${savedCount} teacher override${savedCount === 1 ? '' : 's'} to Firestore.`);
    } catch (error) {
        toast(error.message || 'Unable to save AI review');
    }
}

function downloadQuestionPdfReport() {
    if (!activeQuestionReview) return;
    const jspdf = window.jspdf?.jsPDF;
    if (!jspdf) {
        toast('PDF library is still loading');
        return;
    }
    const docPdf = new jspdf({ unit: 'pt', format: 'a4' });
    const pageWidth = docPdf.internal.pageSize.getWidth();
    const pageHeight = docPdf.internal.pageSize.getHeight();
    const margin = 42;
    const textWidth = pageWidth - margin * 2;
    let y = margin;

    const addText = (text, options = {}) => {
        const size = options.size || 10;
        const style = options.style || 'normal';
        const gap = options.gap ?? 6;
        docPdf.setFont('helvetica', style);
        docPdf.setFontSize(size);
        const lines = docPdf.splitTextToSize(String(text || ''), textWidth);
        lines.forEach(line => {
            if (y > pageHeight - margin) {
                docPdf.addPage();
                y = margin;
            }
            docPdf.text(line, margin, y);
            y += size + 4;
        });
        y += gap;
    };

    const classroom = findClassroom(activeClassroomId) || {};
    const questionText = htmlToText(activeQuestionReview.answer.promptHtml || activeQuestionReview.answer.prompt || '').trim();
    const correctAnswer = activeQuestionReview.answer.correctAnswer || activeQuestionReview.answer.expectedAnswer || 'Teacher review';
    const sortedNotice = els.sortQuestionByMarksDesc.checked ? 'Sorted by marks descending' : 'Original visible order';

    addText(`${activeQuestionReview.label || `Question ${activeQuestionReview.index + 1}`} Review Report`, { size: 16, style: 'bold', gap: 10 });
    addText(`Quiz session: ${classroom.className || classroom.classCode || activeClassroomId || ''}`);
    addText(`Session code: ${classroom.classCode || ''}`);
    addText(`Generated: ${formatDate(Date.now())}`);
    addText(`Order: ${sortedNotice}`);
    addText(`Question: ${questionText || 'No prompt text available'}`, { style: 'bold', gap: 8 });
    addText(`Teacher correct answer: ${correctAnswer}`);

    questionResponsesForDisplay().forEach(({ submission, answer, index }, position) => {
        const review = getAiReview(submission, answer, index);
        const marks = hasSavedAiReview(review) ? `${formatMarks(review.marks)}/4` : 'Pending';
        const reason = hasSavedAiReview(review) ? review.reason : 'No review saved';
        const source = review?.source === 'teacher' ? 'Teacher override' : review?.source === 'ai' ? 'AI generated' : 'Not reviewed';
        const responseText = answerResponseText(answer) || 'Not answered';
        addText(`${position + 1}. ${submission.studentName || 'Student'} (${submission.admissionNo || 'No admission'})`, { size: 11, style: 'bold', gap: 3 });
        addText(`Marks: ${marks} | Source: ${source}`, { gap: 3 });
        addText(`Exact response: ${responseText}`, { gap: 3 });
        addText(`Reason: ${reason}`, { gap: 10 });
    });

    const safeTitle = String(classroom.className || classroom.classCode || 'quiz-session').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    docPdf.save(`${safeTitle || 'quiz-session'}-${String(activeQuestionReview.label || `question-${activeQuestionReview.index + 1}`).toLowerCase()}-review.pdf`);
}

function buildGeminiReviewPrompt(answer, index, rows, useAiAnswer) {
    const question = htmlToText(answer.promptHtml || answer.prompt || '').trim();
    const correctAnswer = answer.correctAnswer || answer.expectedAnswer || '';
    const answerSourceInstruction = useAiAnswer
        ? 'Use AI answer: infer the expected answer and required parts from the question, including proof/work when requested.'
        : 'Use teacher answer: mark against the provided teacher answer and the explicit requirements in the question text.';
    return [
        'Return only compact JSON. One review per supplied student.',
        'Marks: 0-4. Full=4 only when the response satisfies every requested part of the question.',
        'Partial=1-3 for partially correct/incomplete responses; wrong/irrelevant=0.',
        'If the question asks to prove, derive, show working, justify, explain, or give steps, a response that only states the result/theorem is incomplete and must lose marks.',
        'Judge meaning, not keyword presence. Use exact student response only; do not correct or assume missing work.',
        'Reason must be short and include why marks were given or lost.',
        'When useful, include "Language correction: ..." as a corrected English version of the student response only.',
        'Do not present the language correction as the full correct answer, proof, or model solution.',
        'If proof/work is missing, explicitly say the language correction is not a complete answer.',
        'Do not invent answers, students, marks, or reasons.',
        answerSourceInstruction,
        '',
        `Q${index + 1} type: ${answer.type || 'short answer/FIB'}`,
        `Question: ${question || 'No prompt text'}`,
        `Teacher answer: ${correctAnswer || 'missing'}`,
        '',
        `JSON shape: {"reviews":[{"submissionId":"string","marks":0,"reason":"short reason. Language correction: ..."}]}`,
        `Students JSON: ${JSON.stringify(rows)}`
    ].join('\n');
}

async function callGeminiReview(apiKey, prompt) {
    const response = await fetch(GEMINI_INTERACTIONS_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
            model: GEMINI_MODEL,
            input: prompt,
            store: false,
            response_format: {
                type: 'text',
                mime_type: 'application/json',
                schema: {
                    type: 'object',
                    properties: {
                        reviews: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    submissionId: { type: 'string' },
                                    marks: { type: 'integer', minimum: 0, maximum: 4 },
                                    reason: { type: 'string' }
                                },
                                required: ['submissionId', 'marks', 'reason']
                            }
                        }
                    },
                    required: ['reviews']
                }
            },
            generation_config: {
                thinking_level: 'minimal'
            }
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error?.message || 'Gemini request failed');
    }
    if (data.status === 'failed') {
        const message = data.errors?.map(error => error.message).filter(Boolean).join(' ');
        throw new Error(message || 'Gemini interaction failed');
    }
    const text = interactionText(data);
    const parsed = parseJsonResponse(text);
    if (!Array.isArray(parsed.reviews)) {
        throw new Error('Gemini did not return a reviews list');
    }
    return parsed;
}

function interactionText(interaction) {
    return (interaction.steps || [])
        .filter(step => step.type === 'model_output')
        .flatMap(step => step.content || [])
        .filter(part => part.type === 'text')
        .map(part => part.text || '')
        .join('');
}

function parseJsonResponse(text) {
    try {
        return JSON.parse(text);
    } catch {
        const match = String(text || '').match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Gemini returned invalid JSON');
        return JSON.parse(match[0]);
    }
}

function normalizeMarks(value) {
    if (value === '' || value === null || value === undefined) return null;
    const marks = Number(value);
    if (!Number.isFinite(marks)) return null;
    return Math.max(0, Math.min(4, Math.round(marks)));
}

function isReviewableAnswer(answer) {
    if (!answer) return false;
    const type = String(answer.type || '').toLowerCase();
    if (['fib', 'fill', 'blank', 'short'].some(token => type.includes(token))) return true;
    return answer.shortAnswer !== undefined || Array.isArray(answer.fibAnswers);
}

function initializeAiReviewSelection() {
    selectedAiReviewKeys = new Set(
        reviewableResponsesForActiveQuestion({ pendingOnly: true })
            .map(({ submission, answer, index }) => reviewKey(submission, answer, index))
            .filter(Boolean)
    );
}

function selectedAiReviewResponsesForActiveQuestion() {
    return reviewableResponsesForActiveQuestion({ pendingOnly: false }).filter(({ submission, answer, index }) => {
        const key = reviewKey(submission, answer, index);
        return key && selectedAiReviewKeys.has(key);
    });
}

function selectAllAiReviewRows(shouldSelect) {
    reviewableResponsesForActiveQuestion({ pendingOnly: false }).forEach(({ submission, answer, index }) => {
        const key = reviewKey(submission, answer, index);
        if (!key) return;
        if (shouldSelect) {
            selectedAiReviewKeys.add(key);
        } else {
            selectedAiReviewKeys.delete(key);
        }
    });
    renderQuestionResponses();
}

function handleAiReviewSelectionChange(event) {
    const checkbox = event.target.closest('.ai-review-select');
    if (!checkbox) return;
    const row = checkbox.closest('[data-review-key]');
    const key = row?.dataset.reviewKey;
    if (!key) return;
    if (checkbox.checked) {
        selectedAiReviewKeys.add(key);
    } else {
        selectedAiReviewKeys.delete(key);
    }
    updateAiReviewControls();
}

function reviewableResponsesForActiveQuestion(options = {}) {
    if (!activeQuestionReview) return [];
    const pendingOnly = options.pendingOnly ?? $('resultFilter').value === 'ai_pending';
    return activeQuestionReview.responses.filter(({ submission, answer, index }) => {
        if (!isReviewableAnswer(answer)) return false;
        if (!pendingOnly) return true;
        return !hasSavedAiReview(getAiReview(submission, answer, index));
    });
}

function hasPendingAiReview(submission) {
    return (submission.answers || []).some((answer, index) => {
        return isReviewableAnswer(answer) && !hasSavedAiReview(getAiReview(submission, answer, index));
    });
}

function getAiReview(submission, answer, index) {
    if (answer?.aiReview) return answer.aiReview;
    const key = reviewKey(submission, answer, index);
    return key ? aiReviews[key] : null;
}

function hasSavedAiReview(review) {
    return review
        && review.marks !== undefined
        && review.marks !== null
        && String(review.reason || '').trim() !== '';
}

function reviewKey(submission, answer, index) {
    if (!submission?.id) return '';
    return `${submission.id}::${answer?.questionId || index}`;
}

async function persistAiReviewForResponse(response, reviewData) {
    const { submission, index } = response;
    const answers = Array.isArray(submission.answers) ? submission.answers.map(answer => ({ ...answer })) : [];
    if (!submission.id || !answers[index]) return false;
    const savedReview = {
        ...reviewData,
        questionIndex: index,
        questionId: answers[index].questionId || '',
        maxMarks: 4
    };
    answers[index] = {
        ...answers[index],
        aiReview: savedReview
    };
    await updateDoc(doc(db, COLLECTIONS.submissions, submission.id), {
        answers,
        aiReviewUpdatedAt: savedReview.updatedAt,
        aiReviewUpdatedBy: currentUser.uid,
        aiReviewUpdatedByEmail: currentUser.email || ''
    });
    submission.answers = answers;
    aiReviews[reviewKey(submission, answers[index], index)] = savedReview;
    return true;
}

function loadAiReviews() {
    try {
        const parsed = JSON.parse(localStorage.getItem(AI_REVIEW_STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function saveAiReviews() {
    localStorage.setItem(AI_REVIEW_STORAGE_KEY, JSON.stringify(aiReviews));
}

async function renderRich(root) {
    root.querySelectorAll('.math-token').forEach(token => {
        const latex = token.dataset.latex;
        if (latex && window.katex) token.innerHTML = window.katex.renderToString(latex, { throwOnError: false });
    });
    if (!window.mermaid) return;
    for (const token of root.querySelectorAll('.mermaid-token')) {
        const code = token.dataset.code || token.textContent;
        try {
            const { svg } = await window.mermaid.render(`teacher_diag_${Date.now()}_${Math.random().toString(16).slice(2)}`, code);
            token.innerHTML = svg;
        } catch {
            token.innerHTML = '<code>Diagram unavailable</code>';
        }
    }
}

function scorePercent(submission) {
    return scoreDetails(submission).percent;
}

function scoreLabel(submission) {
    const score = scoreDetails(submission);
    if (!score.maxMarks) return '0/0 (0%)';
    return `${formatMarks(score.earnedMarks)}/${formatMarks(score.maxMarks)} (${score.percent}%)`;
}

function scoreDetails(submission) {
    const answers = submission.answers || [];
    const questionCount = Number(submission.questionCount || answers.length || submission.gradableCount || 0);
    const maxMarks = questionCount * 4;
    const earnedMarks = answers.reduce((sum, answer, index) => {
        const review = getAiReview(submission, answer, index);
        if (hasSavedAiReview(review)) return sum + Number(review.marks || 0);
        if (answer?.isCorrect === true) return sum + 4;
        return sum;
    }, 0);
    return {
        earnedMarks,
        maxMarks,
        percent: maxMarks ? Math.round((earnedMarks / maxMarks) * 100) : 0
    };
}

function formatMarks(value) {
    const marks = Number(value || 0);
    return Number.isInteger(marks) ? String(marks) : marks.toFixed(1).replace(/\.0$/, '');
}

function manualCount(submission) {
    return (submission.answers || []).filter(answer => answer.isCorrect === null).length;
}

function answerResponseText(answer) {
    if (!answer) return '';
    if (answer.displayAnswer) return htmlToText(answer.displayAnswer);
    if (answer.shortAnswer) return htmlToText(answer.shortAnswer);
    if (answer.fibAnswers?.length) return answer.fibAnswers.join('|');
    if (answer.trueFalseAnswer !== null && answer.trueFalseAnswer !== undefined) return String(answer.trueFalseAnswer);
    if (answer.selectedOptions?.length) return answer.selectedOptions.join('|');
    return '';
}

function answerState(answer) {
    if (!answer) return { className: 'missing', label: '', title: 'No answer recorded' };
    const response = answerResponseText(answer);
    if (answer.isCorrect === true) return { className: 'correct', label: response || 'Correct', title: response || 'Correct' };
    if (answer.isCorrect === false) return { className: 'wrong', label: response || 'Wrong', title: response || 'Wrong' };
    return { className: 'manual', label: response || 'S', title: response || 'Manual review' };
}

function answerStatusLabel(answer) {
    if (!answer) return 'Missing';
    if (answer.isCorrect === true) return 'Correct';
    if (answer.isCorrect === false) return 'Incorrect';
    return 'Manual review';
}

function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleString();
}

function formatQuizSessionDate(classroom) {
    const value = classroom?.createdDate || classroom?.createdAt?.toMillis?.() || classroom?.createdAt?.seconds * 1000;
    if (!value) return 'Unavailable';
    return new Date(value).toLocaleDateString();
}

function questionListName(questionBankListId) {
    if (!questionBankListId) return 'No question list';
    const list = questionBankLists.find(item => item.id === questionBankListId);
    return list?.name || questionBankListId;
}

function quizSessionTaxonomyLabel(classroom) {
    return [classroom?.classId, classroom?.subjectId, classroom?.chapterId]
        .map(id => taxonomyById.get(id)?.label || taxonomyNodes.find(node => node.id === id)?.label || '')
        .filter(Boolean)
        .join(' / ');
}

function sectionLabel(section) {
    return section.sectionName || section.name || section.className || section.title || section.id;
}

function findClassroom(classroomId) {
    return classrooms.find(c => c.id === classroomId) || sectionClassrooms.find(c => c.id === classroomId);
}

function canAdminSection(section) {
    const email = String(currentUser?.email || '').toLowerCase();
    return (section.members || []).some(member => {
        return String(member.email || '').toLowerCase() === email && member.role === 'admin';
    });
}

function readQuestionTypePickFields() {
    const counts = {};
    QUESTION_TYPE_PICK_FIELDS.forEach(field => {
        const value = Number($(field.inputId).value);
        if (Number.isInteger(value) && value > 0) counts[field.key] = value;
    });
    return Object.keys(counts).length ? counts : null;
}

function setQuestionTypePickFields(counts = {}) {
    QUESTION_TYPE_PICK_FIELDS.forEach(field => {
        $(field.inputId).value = Number.isInteger(Number(counts?.[field.key])) && Number(counts[field.key]) > 0
            ? String(counts[field.key])
            : '';
    });
}

function questionTypePickLabel(counts = {}) {
    const labels = [
        ['mcq', 'MCQ'],
        ['fib', 'FIB'],
        ['short_answer', 'Short'],
        ['true_false', 'T/F']
    ];
    const parts = labels
        .filter(([key]) => Number(counts?.[key]) > 0)
        .map(([key, label]) => `${label} ${counts[key]}`);
    return parts.length ? `Random pick: ${parts.join(', ')}` : '';
}

function studentDifficultyLabel(levels = {}) {
    const count = Object.values(levels || {}).filter(Boolean).length;
    return count ? `${count} student difficulty override${count === 1 ? '' : 's'}` : '';
}

async function openStudentDifficultyDialog(classroom, selectedSection) {
    if (!classroom?.id || !selectedSection?.id) return;
    difficultySession = classroom;
    difficultyStudents = await getStudentsForDifficulty(selectedSection.id);
    difficultySubmissionHistory = await getSubmissionHistoryForDifficulty(selectedSection.id);
    difficultyDraftLevels = { ...(classroom.studentDifficultyLevels || {}) };
    difficultySort = { key: 'avg', direction: 'desc', subject: '' };
    els.studentDifficultySummary.textContent = difficultyStudents.length
        ? `Set optional question difficulty overrides for ${sectionLabel(selectedSection)}. Blank uses the quiz session default.`
        : `No students found in ${sectionLabel(selectedSection)}.`;
    renderStudentDifficultyList();
    els.studentDifficultyDialog.showModal();
}

async function maybeOpenStudentDifficultyDialog(classroom, selectedSection) {
    if (!selectedSection?.id) return;
    try {
        await openStudentDifficultyDialog(classroom, selectedSection);
    } catch (error) {
        reportError('Quiz session saved, but students could not be loaded', error);
    }
}

async function getStudentsForDifficulty(sectionId) {
    if (activeSectionId === sectionId && sectionStudents.length) return sectionStudents;
    const snap = await getDocs(collection(db, COLLECTIONS.classSections, sectionId, 'students'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
        return String(a.admissionNo || a.id).localeCompare(String(b.admissionNo || b.id), undefined, { numeric: true });
    });
}

async function getSubmissionHistoryForDifficulty(sectionId) {
    const byId = new Map();
    submissions
        .filter(submission => submission.sectionId === sectionId)
        .forEach(submission => byId.set(submission.id, submission));
    try {
        const snap = await getDocs(query(collection(db, COLLECTIONS.submissions), where('sectionId', '==', sectionId)));
        snap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
    } catch (error) {
        console.error('Unable to load past section submissions for difficulty picker', error);
    }
    return Array.from(byId.values()).sort((a, b) => (b.submittedAtMillis || 0) - (a.submittedAtMillis || 0));
}

function renderStudentDifficultyList() {
    const subjects = studentDifficultySubjects();
    const rows = sortedDifficultyStudents();
    const controls = `
        <div class="student-difficulty-tools">
            <label class="field">
                <span>Subject</span>
                <select id="difficultySubjectFilter">
                    <option value="">All subjects</option>
                    ${subjects.map(subject => `<option value="${esc(subject)}" ${subject === difficultySort.subject ? 'selected' : ''}>${esc(subject)}</option>`).join('')}
                </select>
            </label>
            <label class="field">
                <span>Sort By</span>
                <select id="difficultySortKey">
                    <option value="avg" ${difficultySort.key === 'avg' ? 'selected' : ''}>Avg</option>
                    <option value="best" ${difficultySort.key === 'best' ? 'selected' : ''}>Best</option>
                    <option value="last" ${difficultySort.key === 'last' ? 'selected' : ''}>Last</option>
                </select>
            </label>
            <label class="field">
                <span>Order</span>
                <select id="difficultySortDirection">
                    <option value="desc" ${difficultySort.direction === 'desc' ? 'selected' : ''}>Desc</option>
                    <option value="asc" ${difficultySort.direction === 'asc' ? 'selected' : ''}>Asc</option>
                </select>
            </label>
        </div>
    `;
    const list = rows.length ? rows.map(({ student, history }) => {
        const admissionNo = String(student.admissionNo || student.id);
        const selected = String(difficultyDraftLevels[admissionNo] || '');
        return `
            <div class="student-difficulty-row">
                <div class="student-difficulty-main">
                    <strong>${esc(student.name || 'Student')}</strong>
                    <small>${esc(admissionNo)}</small>
                    ${studentHistoryHtml(history)}
                </div>
                <label class="student-difficulty-control">
                    <span>Difficulty</span>
                    <select data-student-difficulty="${esc(admissionNo)}">
                        <option value="">Session default</option>
                        ${DIFFICULTY_LEVELS.map(level => `<option value="${esc(level)}" ${level === selected ? 'selected' : ''}>${esc(level)}</option>`).join('')}
                    </select>
                </label>
            </div>
        `;
    }).join('') : '<div class="empty-card">No students match this subject filter.</div>';
    els.studentDifficultyList.innerHTML = difficultyStudents.length
        ? `${controls}${list}`
        : '<div class="empty-card">No students available for difficulty overrides.</div>';
    bindStudentDifficultyListEvents();
}

function studentDifficultyHistory(student) {
    return studentDifficultyHistoryForSubject(student, difficultySort.subject);
}

function studentDifficultyHistoryForSubject(student, subject = '') {
    const admissionNo = String(student.admissionNo || student.id || '').trim();
    const studentId = String(student.id || '').trim();
    return difficultySubmissionHistory.filter(submission => {
        const submissionAdmission = String(submission.admissionNo || '').trim();
        const submissionKey = String(submission.studentKey || '').trim();
        const studentMatches = submissionAdmission === admissionNo
            || (studentId && submissionKey === studentId)
            || (studentId && submissionKey.endsWith(`_${studentId}`))
            || (admissionNo && submissionKey.endsWith(`_${admissionNo}`));
        return studentMatches && (!subject || submission.subject === subject);
    });
}

function sortedDifficultyStudents() {
    return difficultyStudents
        .map(student => ({ student, history: studentDifficultyHistory(student) }))
        .filter(item => !difficultySort.subject || item.history.length)
        .sort((a, b) => {
            const diff = difficultyHistoryMetric(a.history, difficultySort.key) - difficultyHistoryMetric(b.history, difficultySort.key);
            if (diff) return difficultySort.direction === 'asc' ? diff : -diff;
            return compareText(a.student.name || '', b.student.name || '')
                || compareText(a.student.admissionNo || a.student.id, b.student.admissionNo || b.student.id);
        });
}

function difficultyHistoryMetric(history, key) {
    const metrics = studentHistoryMetrics(history);
    if (key === 'best') return metrics.best;
    if (key === 'last') return metrics.lastPercent;
    return metrics.average;
}

function studentHistoryMetrics(history) {
    if (!history.length) return { average: 0, best: 0, lastPercent: 0 };
    const scored = history.filter(submission => scoreDetails(submission).maxMarks > 0);
    const average = scored.length
        ? Math.round(scored.reduce((sum, submission) => sum + scoreDetails(submission).percent, 0) / scored.length)
        : 0;
    const best = scored.length ? Math.max(...scored.map(submission => scoreDetails(submission).percent)) : 0;
    return {
        average,
        best,
        lastPercent: scoreDetails(history[0]).percent
    };
}

function studentDifficultySubjects() {
    return Array.from(new Set(difficultySubmissionHistory.map(submission => submission.subject).filter(Boolean)))
        .sort((a, b) => compareText(a, b));
}

function bindStudentDifficultyListEvents() {
    $('difficultySubjectFilter')?.addEventListener('change', event => {
        difficultySort.subject = event.target.value;
        renderStudentDifficultyList();
    });
    $('difficultySortKey')?.addEventListener('change', event => {
        difficultySort.key = event.target.value;
        renderStudentDifficultyList();
    });
    $('difficultySortDirection')?.addEventListener('change', event => {
        difficultySort.direction = event.target.value;
        renderStudentDifficultyList();
    });
    els.studentDifficultyList.querySelectorAll('[data-student-difficulty]').forEach(select => {
        select.addEventListener('change', event => {
            if (event.target.value) difficultyDraftLevels[event.target.dataset.studentDifficulty] = event.target.value;
            else delete difficultyDraftLevels[event.target.dataset.studentDifficulty];
        });
    });
}

function studentHistoryHtml(history) {
    if (!history.length) {
        return '<div class="student-history empty">No past submissions found for this class section.</div>';
    }
    const metrics = studentHistoryMetrics(history);
    const last = history[0];
    const lastScore = scoreLabel(last);
    const pendingManual = history.reduce((sum, submission) => sum + manualCount(submission), 0);
    const typeSummary = studentAnswerTypeSummary(history);
    return `
        <div class="student-history">
            <span>${history.length} attempt${history.length === 1 ? '' : 's'}</span>
            <span>Avg ${metrics.average}%</span>
            <span>Best ${metrics.best}%</span>
            <span>Last ${esc(lastScore)}</span>
            ${pendingManual ? `<span>${pendingManual} pending review</span>` : ''}
            ${typeSummary ? `<span>${esc(typeSummary)}</span>` : ''}
            <small>Last submitted ${esc(formatDate(last.submittedAtMillis) || 'date unavailable')}</small>
        </div>
    `;
}

function studentAnswerTypeSummary(history) {
    const totals = {};
    history.forEach(submission => {
        (submission.answers || []).forEach(answer => {
            const type = answer?.type || 'question';
            totals[type] = totals[type] || { total: 0, missed: 0 };
            totals[type].total += 1;
            if (answer?.isCorrect !== true) totals[type].missed += 1;
        });
    });
    const weakest = Object.entries(totals)
        .filter(([, item]) => item.total > 0)
        .sort((a, b) => (b[1].missed / b[1].total) - (a[1].missed / a[1].total))[0];
    if (!weakest || !weakest[1].missed) return '';
    return `Needs practice: ${questionTypeLabel(weakest[0])}`;
}

function questionTypeLabel(type) {
    const labels = {
        mcq: 'MCQ',
        fib: 'FIB',
        short_answer: 'Short answer',
        true_false: 'True/False',
        mixed: 'Mixed',
        unknown: 'Unknown'
    };
    return labels[type] || type;
}

async function saveStudentDifficulty(event) {
    event.preventDefault();
    if (!difficultySession?.id) return;
    const levels = { ...difficultyDraftLevels };
    els.studentDifficultyList.querySelectorAll('[data-student-difficulty]').forEach(select => {
        if (select.value) levels[select.dataset.studentDifficulty] = select.value;
        else delete levels[select.dataset.studentDifficulty];
    });
    const updates = {
        studentDifficultyLevels: Object.keys(levels).length ? levels : deleteField(),
        studentDifficultyUpdatedAt: serverTimestamp()
    };
    try {
        await updateDoc(doc(db, COLLECTIONS.classrooms, difficultySession.id), updates);
        difficultySession.studentDifficultyLevels = Object.keys(levels).length ? levels : undefined;
        const local = findClassroom(difficultySession.id);
        if (local) {
            if (Object.keys(levels).length) local.studentDifficultyLevels = levels;
            else delete local.studentDifficultyLevels;
        }
        els.studentDifficultyDialog.close();
        renderClassrooms();
        toast('Student difficulty saved');
    } catch (error) {
        reportError('Unable to save student difficulty', error);
    }
}

async function findClassroomByCode(classCode, excludeClassroomId = '') {
    const code = String(classCode || '').trim();
    if (!code) return null;
    const localDuplicate = [...classrooms, ...sectionClassrooms].find(classroom => {
        return classroom.classCode === code && classroom.id !== excludeClassroomId;
    });
    if (localDuplicate) return localDuplicate;
    const snap = await getDocs(query(collection(db, COLLECTIONS.classrooms), where('classCode', '==', code)));
    const duplicate = snap.docs.find(item => item.id !== excludeClassroomId);
    return duplicate ? { id: duplicate.id, ...duplicate.data() } : null;
}

async function generateUniqueClassCode() {
    try {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const code = generateClassCode();
            if (!await findClassroomByCode(code)) return code;
        }
    } catch {
        return generateClassCode();
    }
    return generateClassCode();
}

function generateClassCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function htmlToText(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    return template.content.textContent || String(value || '');
}

function normalizeExportText(value) {
    return String(value ?? '')
        .replaceAll('Î¸', 'θ')
        .replaceAll('Î˜', 'Θ')
        .replaceAll('Ï€', 'π')
        .replaceAll('Â°', '°')
        .replaceAll('Â±', '±')
        .replaceAll('Ã—', '×')
        .replaceAll('Ã·', '÷')
        .replaceAll('âˆ’', '−')
        .replaceAll('â‰ ', '≠')
        .replaceAll('â‰¤', '≤')
        .replaceAll('â‰¥', '≥')
        .replaceAll('âˆš', '√')
        .replaceAll('Â', '');
}

function textForPdf(value) {
    return normalizeExportText(value)
        .replaceAll('θ', 'theta')
        .replaceAll('Θ', 'Theta')
        .replaceAll('π', 'pi')
        .replaceAll('−', '-')
        .replaceAll('≤', '<=')
        .replaceAll('≥', '>=')
        .replaceAll('≠', '!=')
        .replaceAll('√', 'sqrt');
}

function sanitizeRich(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    template.content.querySelectorAll('script, iframe, object, embed').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
        Array.from(node.attributes).forEach(attr => {
            if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
        });
    });
    return template.innerHTML;
}

function toCsv(rows) {
    const body = rows.map(row => row.map(value => {
        const text = normalizeExportText(value);
        return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    }).join(',')).join('\n');
    return `\uFEFF${body}`;
}

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function setStatus(message) {
    els.statusText.textContent = message;
}

function reportError(context, error) {
    console.error(context, error);
    toast(error?.message || context, { type: 'error', duration: 9000 });
}

function toast(message, options = {}) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', options.type === 'error');
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        els.toast.classList.remove('show');
        els.toast.classList.remove('error');
    }, options.duration || 2200);
}
