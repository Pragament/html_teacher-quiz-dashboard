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
    submissions: 'qb_quiz_submissions_v1'
};

const EXPORT_SETTINGS_KEY = 'teacherQuizDashboard.exportSettings.v1';
const TOUR_PROMPT_DISABLED_KEY = 'teacherQuizDashboard.tourPromptDisabled.v1';
const GEMINI_KEY_STORAGE_KEY = 'teacherQuizDashboard.geminiApiKey.v1';
const AI_REVIEW_STORAGE_KEY = 'teacherQuizDashboard.aiReviews.v1';
const GEMINI_MODEL = 'gemini-2.5-flash';
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let classrooms = [];
let classSections = [];
let sectionStudents = [];
let sectionClassrooms = [];
let questionBankLists = [];
let activeClassroomId = null;
let activeSectionId = null;
let submissions = [];
let submissionViewMode = 'table';
let submissionSort = { key: 'score', direction: 'desc' };
let activeQuestionReview = null;
let aiReviews = loadAiReviews();
let aiReviewInFlight = false;
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
    submissionSummary: $('submissionSummary'),
    submissionList: $('submissionList'),
    detailDialog: $('detailDialog'),
    detailTitle: $('detailTitle'),
    detailMeta: $('detailMeta'),
    detailStats: $('detailStats'),
    answerDetails: $('answerDetails'),
    questionDialog: $('questionDialog'),
    questionDetailTitle: $('questionDetailTitle'),
    questionDetailMeta: $('questionDetailMeta'),
    questionPrompt: $('questionPrompt'),
    questionResponseList: $('questionResponseList'),
    aiReviewBtn: $('aiReviewBtn'),
    saveAiReviewOverridesBtn: $('saveAiReviewOverridesBtn'),
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
    pickMcqCount: $('pickMcqCount'),
    pickFibCount: $('pickFibCount'),
    pickShortAnswerCount: $('pickShortAnswerCount'),
    pickTrueFalseCount: $('pickTrueFalseCount'),
    saveClassroomBtn: $('saveClassroomBtn'),
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

const filterIds = ['classroomSearch', 'studentSearch', 'subjectFilter', 'chapterFilter', 'resultFilter'];

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
        submissions = [];
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
    $('closeDetailBtn').addEventListener('click', () => els.detailDialog.close());
    $('closeQuestionBtn').addEventListener('click', () => els.questionDialog.close());
    $('cancelGeminiBtn').addEventListener('click', () => els.geminiDialog.close());
    els.geminiKeyForm.addEventListener('submit', saveGeminiKey);
    els.removeGeminiKeyBtn.addEventListener('click', removeGeminiKey);
    els.aiReviewBtn.addEventListener('click', reviewActiveQuestionWithGemini);
    els.saveAiReviewOverridesBtn.addEventListener('click', saveAiReviewOverrides);
    els.sortQuestionByMarksDesc.addEventListener('change', renderQuestionResponses);
    els.downloadQuestionPdfBtn.addEventListener('click', downloadQuestionPdfReport);
    $('skipTourBtn').addEventListener('click', skipTourPrompt);
    $('cancelClassroomEditBtn').addEventListener('click', () => els.classroomDialog.close());
    $('skipStudentDifficultyBtn').addEventListener('click', () => els.studentDifficultyDialog.close());
    $('cancelExportBtn').addEventListener('click', () => els.exportDialog.close());
    els.editClassroomForm.addEventListener('submit', saveClassroomEdit);
    els.studentDifficultyForm.addEventListener('submit', saveStudentDifficulty);
    els.tourPromptForm.addEventListener('submit', startPromptedTour);
    els.exportForm.addEventListener('submit', exportSubmissionsCsv);
    $('exportCsvBtn').addEventListener('click', openExportDialog);
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
        activeClassroomId = activeClassroomId || classrooms[0]?.id || null;
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
    if (classroom.sectionId) {
        queries.push(query(collection(db, COLLECTIONS.submissions), where('sectionId', '==', classroom.sectionId)));
    }
    try {
        for (const q of queries) {
            const snap = await getDocs(q);
            snap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
        }
        submissions = Array.from(byId.values()).sort((a, b) => (b.submittedAtMillis || 0) - (a.submittedAtMillis || 0));
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
    renderSubmissions();
}

function renderClassrooms() {
    const search = $('classroomSearch').value.trim().toLowerCase();
    const visible = classrooms.filter(c => {
        if (!search) return true;
        return [c.className, c.classCode, c.sectionName, c.sectionId].some(value => String(value || '').toLowerCase().includes(search));
    });
    els.classroomCount.textContent = String(visible.length);
    els.classroomList.innerHTML = visible.length ? visible.map(c => `
        <article class="classroom-card ${c.id === activeClassroomId ? 'active' : ''}">
            <button class="classroom-select" data-classroom="${c.id}">
                <strong>${esc(c.className || c.classCode || c.id)}</strong>
                <span>${esc(c.sectionName || c.sectionId || 'No class section')}</span>
                <span class="submission-meta">
                    <span>Session code ${esc(c.classCode || c.id)}</span>
                    <span>${c.classEnabled === true ? 'Enabled' : 'Disabled'}</span>
                </span>
                <span class="question-list-label">${esc(questionListName(c.questionBankListId))}</span>
                ${questionTypePickLabel(c.randomQuestionTypeCounts) ? `<span class="question-list-label">${esc(questionTypePickLabel(c.randomQuestionTypeCounts))}</span>` : ''}
                ${studentDifficultyLabel(c.studentDifficultyLevels) ? `<span class="question-list-label">${esc(studentDifficultyLabel(c.studentDifficultyLevels))}</span>` : ''}
            </button>
            <button class="btn classroom-edit-btn" type="button" data-edit-classroom="${c.id}">Edit</button>
        </article>
    `).join('') : '<div class="empty-card">No matching quiz sessions.</div>';
    document.querySelectorAll('[data-classroom]').forEach(btn => {
        btn.addEventListener('click', () => loadSubmissionsForClassroom(btn.dataset.classroom));
    });
    document.querySelectorAll('[data-edit-classroom]').forEach(btn => {
        btn.addEventListener('click', () => openClassroomEditor(btn.dataset.editClassroom));
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
                <article class="section-classroom-card">
                    <button class="section-classroom-main" type="button" data-section-classroom="${classroom.id}">
                        <strong>${esc(classroom.className || classroom.classCode || classroom.id)}</strong>
                        <span>Session code ${esc(classroom.classCode || classroom.id)}</span>
                        <span>${classroom.classEnabled === true ? 'Enabled' : 'Disabled'}</span>
                    </button>
                    ${classroom.creatorId === currentUser.uid ? `<button class="btn small" type="button" data-edit-classroom="${classroom.id}">Edit</button>` : ''}
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
    els.editClassCode.value = await generateUniqueClassCode();
    renderSectionOptions();
    els.editClassEnabled.checked = true;
    els.editQuestionBankList.innerHTML = `
        <option value="">No question list</option>
        ${questionBankLists.map(list => `<option value="${esc(list.id)}">${esc(list.name || list.id)}</option>`).join('')}
    `;
    els.editQuestionBankList.value = '';
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

function openClassroomEditor(classroomId) {
    const classroom = findClassroom(classroomId);
    if (!classroom) return;
    els.editClassroomTitle.textContent = `Edit Quiz Session: ${classroom.className || classroom.classCode || classroom.id}`;
    els.editClassroomId.value = classroom.id;
    els.editClassroomName.value = classroom.className || '';
    els.editClassCode.value = classroom.classCode || '';
    renderSectionOptions(classroom.sectionId, classroom.sectionName);
    els.editClassEnabled.checked = classroom.classEnabled === true;
    els.editQuestionBankList.innerHTML = `
        <option value="">No question list</option>
        ${questionBankLists.map(list => `<option value="${esc(list.id)}">${esc(list.name || list.id)}</option>`).join('')}
    `;
    els.editQuestionBankList.value = classroom.questionBankListId || '';
    setQuestionTypePickFields(classroom.randomQuestionTypeCounts);
    els.saveClassroomBtn.textContent = 'Save Quiz Session';
    els.classroomDialog.showModal();
}

async function saveClassroomEdit(event) {
    event.preventDefault();
    if (!currentUser) return;
    const classroomId = els.editClassroomId.value;
    const classroom = classrooms.find(c => c.id === classroomId);
    const questionBankListId = els.editQuestionBankList.value;
    const selectedList = questionBankLists.find(list => list.id === questionBankListId);
    const selectedSection = classSections.find(section => section.id === els.editSectionId.value);
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
        if (randomQuestionTypeCounts) createValues.randomQuestionTypeCounts = randomQuestionTypeCounts;
        const createdClassroom = await createClassroom(createValues, selectedList, selectedSection);
        if (createdClassroom) await maybeOpenStudentDifficultyDialog(createdClassroom, selectedSection);
        return;
    }

    try {
        await updateDoc(doc(db, COLLECTIONS.classrooms, classroom.id), updates);
        Object.assign(classroom, updates, {
            sectionId: selectedSection?.id,
            sectionName: selectedSection ? sectionLabel(selectedSection) : undefined,
            questionBankListId: selectedList?.id
        });
        if (!selectedSection) {
            delete classroom.sectionId;
            delete classroom.sectionName;
            delete classroom.studentDifficultyLevels;
        }
        if (!selectedList) delete classroom.questionBankListId;
        if (randomQuestionTypeCounts) classroom.randomQuestionTypeCounts = randomQuestionTypeCounts;
        else delete classroom.randomQuestionTypeCounts;
        els.classroomDialog.close();
        render();
        toast('Quiz session updated');
    } catch (error) {
        reportError('Unable to update quiz session', error);
        return;
    }
    await maybeOpenStudentDifficultyDialog(classroom, selectedSection);
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
    els.tableViewBtn.classList.toggle('active', submissionViewMode === 'table');
    els.cardViewBtn.classList.toggle('active', submissionViewMode === 'cards');
    els.submissionList.className = submissionViewMode === 'table' ? 'submission-table-wrap' : 'submission-list';
    els.submissionList.innerHTML = sorted.length
        ? submissionViewMode === 'table' ? submissionTable(sorted) : sorted.map(submissionCard).join('')
        : '<div class="empty-card">No submissions match these filters.</div>';
    document.querySelectorAll('[data-detail]').forEach(btn => {
        btn.addEventListener('click', () => openSubmissionDetail(btn.dataset.detail));
    });
    document.querySelectorAll('[data-question-index]').forEach(btn => {
        btn.addEventListener('click', () => openQuestionDetail(Number(btn.dataset.questionIndex)));
    });
    document.querySelectorAll('[data-submission-sort]').forEach(btn => {
        btn.addEventListener('click', () => setSubmissionSort(btn.dataset.submissionSort));
    });
}

function setSubmissionViewMode(mode) {
    submissionViewMode = mode;
    renderSubmissions();
}

function submissionTable(items) {
    const maxAnswers = items.reduce((max, s) => Math.max(max, (s.answers || []).length), 0);
    const questionHeaders = Array.from({ length: maxAnswers }, (_, index) => `
        <th scope="col">
            <button class="question-head-btn" type="button" data-question-index="${index}">Q${index + 1}</button>
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
                        ${Array.from({ length: maxAnswers }, (_, index) => answerCell((s.answers || [])[index])).join('')}
                        <td>${esc(scoreLabel(s))}</td>
                        <td>${manualCount(s) ? esc(`${manualCount(s)} manual`) : ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
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

function openQuestionDetail(index) {
    const visible = sortedSubmissions(filteredSubmissions());
    const answer = visible.map(s => (s.answers || [])[index]).find(Boolean);
    if (!answer) return;
    const responses = visible.map(s => ({ submission: s, answer: (s.answers || [])[index] }));
    const answered = responses.filter(item => item.answer);
    const correct = answered.filter(item => item.answer.isCorrect === true).length;
    const wrong = answered.filter(item => item.answer.isCorrect === false).length;
    const manual = answered.filter(item => item.answer && item.answer.isCorrect !== true && item.answer.isCorrect !== false).length;

    els.questionDetailTitle.textContent = `Question ${index + 1}`;
    els.questionDetailMeta.textContent = `${correct} correct · ${wrong} wrong · ${manual} manual · ${visible.length - answered.length} missing`;
    els.questionPrompt.innerHTML = `
        <div class="rich-content">${sanitizeRich(answer.promptHtml || '')}</div>
        <div><strong>Correct answer:</strong> ${esc(answer.correctAnswer || 'Teacher review')}</div>
        <div class="answer-footer">
            <span>${esc(answer.type || '')}</span>
            ${answer.questionId ? `<span>${esc(answer.questionId)}</span>` : ''}
        </div>
    `;
    activeQuestionReview = { index, answer, responses };
    updateAiReviewControls();
    renderQuestionResponses();
    renderRich(els.questionPrompt);
    els.questionDialog.showModal();
}

function updateAiReviewControls(message = '') {
    if (!activeQuestionReview) return;
    const reviewable = reviewableResponsesForActiveQuestion().length;
    const hasKey = !!loadGeminiKey();
    els.aiReviewBtn.disabled = reviewable === 0;
    els.saveAiReviewOverridesBtn.disabled = activeQuestionReview.responses.length === 0;
    if (message) {
        els.aiReviewStatus.textContent = message;
    } else if (!reviewable) {
        els.aiReviewStatus.textContent = 'Gemini review is available for FIB and short-answer questions only.';
    } else {
        els.aiReviewStatus.textContent = `${reviewable} response${reviewable === 1 ? '' : 's'} ready for AI review. ${hasKey ? 'Gemini key saved.' : 'Add your Gemini key before reviewing.'}`;
    }
}

function renderQuestionResponses() {
    if (!activeQuestionReview) return;
    const { index } = activeQuestionReview;
    els.questionResponseList.innerHTML = questionResponsesForDisplay().map(({ submission, answer: itemAnswer }) => {
        const state = answerState(itemAnswer);
        const statusLabel = answerStatusLabel(itemAnswer);
        const responseText = answerResponseText(itemAnswer);
        const reviewable = isReviewableAnswer(itemAnswer);
        const key = reviewKey(submission, itemAnswer, index);
        const review = getAiReview(submission, itemAnswer, index);
        return `
            <article class="question-response-row ai-response-row" data-review-key="${esc(key)}">
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
}

function questionResponsesForDisplay() {
    if (!activeQuestionReview) return [];
    const { index, responses } = activeQuestionReview;
    const items = [...responses];
    if (!els.sortQuestionByMarksDesc.checked) return items;
    return items.sort((a, b) => {
        const aMarks = reviewMarksForSort(getAiReview(a.submission, a.answer, index));
        const bMarks = reviewMarksForSort(getAiReview(b.submission, b.answer, index));
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
    return submissions.filter(s => {
        if (student && ![s.studentName, s.admissionNo, s.studentKey].some(value => String(value || '').toLowerCase().includes(student))) return false;
        if (subject && !String(s.subject || '').toLowerCase().includes(subject)) return false;
        if (chapter && !(s.chapters || []).some(value => String(value || '').toLowerCase().includes(chapter))) return false;
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

    const reviewableResponses = reviewableResponsesForActiveQuestion();
    const rows = reviewableResponses
        .map(({ submission, answer }) => ({
            submissionId: submission.id,
            studentName: submission.studentName || 'Student',
            admissionNo: submission.admissionNo || '',
            exactResponse: answerResponseText(answer)
        }));
    if (!rows.length) {
        updateAiReviewControls('No FIB or short-answer responses found for this question.');
        return;
    }

    updateAiReviewControls('Reviewing with Gemini...');
    aiReviewInFlight = true;
    els.aiReviewBtn.disabled = true;
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
        els.aiReviewBtn.disabled = reviewableResponsesForActiveQuestion().length === 0;
    }
}

async function saveAiReviewOverrides() {
    if (!activeQuestionReview) return;
    const writes = [];
    els.questionResponseList.querySelectorAll('[data-review-key]').forEach(row => {
        const key = row.dataset.reviewKey;
        if (!key) return;
        const response = activeQuestionReview.responses.find(item => {
            return reviewKey(item.submission, item.answer, activeQuestionReview.index) === key;
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

    addText(`Question ${activeQuestionReview.index + 1} Review Report`, { size: 16, style: 'bold', gap: 10 });
    addText(`Quiz session: ${classroom.className || classroom.classCode || activeClassroomId || ''}`);
    addText(`Session code: ${classroom.classCode || ''}`);
    addText(`Generated: ${formatDate(Date.now())}`);
    addText(`Order: ${sortedNotice}`);
    addText(`Question: ${questionText || 'No prompt text available'}`, { style: 'bold', gap: 8 });
    addText(`Teacher correct answer: ${correctAnswer}`);

    questionResponsesForDisplay().forEach(({ submission, answer }, position) => {
        const review = getAiReview(submission, answer, activeQuestionReview.index);
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
    docPdf.save(`${safeTitle || 'quiz-session'}-question-${activeQuestionReview.index + 1}-review.pdf`);
}

function buildGeminiReviewPrompt(answer, index, rows, useAiAnswer) {
    const question = htmlToText(answer.promptHtml || answer.prompt || '').trim();
    const correctAnswer = answer.correctAnswer || answer.expectedAnswer || '';
    const answerSourceInstruction = useAiAnswer
        ? 'Use AI answer: infer the expected answer only from the question, then mark against it.'
        : 'Use teacher answer: mark only against the provided teacher correct answer.';
    return [
        'Return only compact JSON. One review per supplied student.',
        'Marks: 0-4. Full=4, partial=1-3, wrong/irrelevant=0.',
        'Judge meaning, not keyword presence. Use exact student response only; do not correct or assume it.',
        'Reason must be short and include: why marks were given; correct English sentence formation.',
        'Do not invent answers, students, marks, or reasons.',
        answerSourceInstruction,
        '',
        `Q${index + 1} type: ${answer.type || 'short answer/FIB'}`,
        `Question: ${question || 'No prompt text'}`,
        `Teacher answer: ${correctAnswer || 'missing'}`,
        '',
        `JSON shape: {"reviews":[{"submissionId":"string","marks":0,"reason":"short reason; Correct sentence: ..."}]}`,
        `Students JSON: ${JSON.stringify(rows)}`
    ].join('\n');
}

async function callGeminiReview(apiKey, prompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.1
            }
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error?.message || 'Gemini request failed');
    }
    const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    const parsed = parseJsonResponse(text);
    if (!Array.isArray(parsed.reviews)) {
        throw new Error('Gemini did not return a reviews list');
    }
    return parsed;
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

function reviewableResponsesForActiveQuestion() {
    if (!activeQuestionReview) return [];
    const pendingOnly = $('resultFilter').value === 'ai_pending';
    return activeQuestionReview.responses.filter(({ submission, answer }) => {
        if (!isReviewableAnswer(answer)) return false;
        if (!pendingOnly) return true;
        return !hasSavedAiReview(getAiReview(submission, answer, activeQuestionReview.index));
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
    const { submission } = response;
    const index = activeQuestionReview.index;
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

function questionListName(questionBankListId) {
    if (!questionBankListId) return 'No question list';
    const list = questionBankLists.find(item => item.id === questionBankListId);
    return list?.name || questionBankListId;
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
        true_false: 'True/False'
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
    return rows.map(row => row.map(value => {
        const text = String(value ?? '');
        return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    }).join(',')).join('\n');
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
