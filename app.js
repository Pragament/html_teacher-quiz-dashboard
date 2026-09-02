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
const EXPORT_FIELDS = [
    { id: 'classroomId', label: 'Classroom ID', header: 'classroomId', value: (s) => s.classroomId || activeClassroomId || '' },
    { id: 'classCode', label: 'Class Code', header: 'classCode', value: (s, classroom) => classroom.classCode || '' },
    { id: 'sectionId', label: 'Section ID', header: 'sectionId', value: (s, classroom) => s.sectionId || classroom.sectionId || '' },
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
let questionBankLists = [];
let activeClassroomId = null;
let activeSectionId = null;
let submissions = [];
let submissionViewMode = 'table';
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const els = {
    topbar: $('topbar'),
    statusText: $('statusText'),
    loginBtn: $('loginBtn'),
    loginHeroBtn: $('loginHeroBtn'),
    tourBtn: $('tourBtn'),
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
    saveClassroomBtn: $('saveClassroomBtn'),
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
    els.logoutBtn.hidden = !user;
    els.refreshBtn.hidden = !user;
    els.loginView.hidden = !!user;
    els.classroomPanel.hidden = !user;
    els.dashboardView.hidden = !user;
    if (!user) {
        classrooms = [];
        classSections = [];
        sectionStudents = [];
        questionBankLists = [];
        submissions = [];
        activeClassroomId = null;
        activeSectionId = null;
        setStatus('Sign in to view your classrooms');
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
    els.logoutBtn.addEventListener('click', () => signOut(auth));
    els.refreshBtn.addEventListener('click', refreshActive);
    $('createClassroomBtn').addEventListener('click', openClassroomCreator);
    $('closeDetailBtn').addEventListener('click', () => els.detailDialog.close());
    $('closeQuestionBtn').addEventListener('click', () => els.questionDialog.close());
    $('skipTourBtn').addEventListener('click', skipTourPrompt);
    $('cancelClassroomEditBtn').addEventListener('click', () => els.classroomDialog.close());
    $('cancelExportBtn').addEventListener('click', () => els.exportDialog.close());
    els.editClassroomForm.addEventListener('submit', saveClassroomEdit);
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
                intro: 'Welcome to the Teacher Quiz Dashboard. Sign in to create classes, assign question lists, and review student quiz submissions.'
            },
            {
                element: els.loginHeroBtn,
                intro: 'Use Google Login with the teacher account that owns your classrooms.'
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
                intro: 'Start here to create a classroom for a new quiz or student group.'
            },
            {
                element: els.editClassroomName,
                intro: 'Give the classroom a clear name your teacher dashboard can recognize.'
            },
            {
                element: els.editQuestionBankList,
                intro: 'Optionally select one of your private question lists. This controls which saved bank list is attached to the classroom.'
            },
            {
                element: els.editClassCode,
                intro: 'This class code is what students use to join or submit to the classroom. You can keep the generated code or type your own.'
            },
            {
                element: els.saveClassroomBtn,
                intro: 'Save the classroom when the name, question list, and code look right.'
            },
            {
                element: els.classroomList,
                intro: 'After saving, share the class code shown on the classroom card with students.'
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
        const snap = await getDocs(collection(db, COLLECTIONS.classSections));
        classSections = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
            return sectionLabel(a).localeCompare(sectionLabel(b), undefined, { sensitivity: 'base' });
        });
        if (activeSectionId && !classSections.some(section => section.id === activeSectionId)) {
            activeSectionId = null;
            sectionStudents = [];
        }
    } catch (error) {
        classSections = [];
        sectionStudents = [];
        activeSectionId = null;
        toast('Unable to load sections');
    }
}

async function loadStudentsForSection(sectionId) {
    const section = classSections.find(item => item.id === sectionId);
    if (!section) return;
    activeSectionId = sectionId;
    sectionStudents = [];
    renderSections();
    try {
        const snap = await getDocs(collection(db, COLLECTIONS.classSections, sectionId, 'students'));
        sectionStudents = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
            return String(a.admissionNo || a.id).localeCompare(String(b.admissionNo || b.id), undefined, { numeric: true });
        });
        renderSections();
    } catch (error) {
        sectionStudents = [];
        renderSections();
        toast('Unable to load students');
    }
}

async function loadClassrooms() {
    if (!currentUser) return;
    setStatus('Loading classrooms...');
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
            setStatus('No classrooms found for this teacher account.');
            render();
        }
    } catch (error) {
        setStatus(error.message || 'Unable to load classrooms');
        toast('Unable to load classrooms');
    }
}

async function refreshActive() {
    if (!currentUser) return;
    await loadClassSections();
    await loadQuestionBankLists();
    await loadClassrooms();
}

async function loadSubmissionsForClassroom(classroomId) {
    const classroom = classrooms.find(c => c.id === classroomId);
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
                <span>${esc(c.sectionName || c.sectionId || 'No section')}</span>
                <span class="submission-meta">
                    <span>Code ${esc(c.classCode || c.id)}</span>
                    <span>${c.classEnabled === true ? 'Enabled' : 'Disabled'}</span>
                </span>
                <span class="question-list-label">${esc(questionListName(c.questionBankListId))}</span>
            </button>
            <button class="btn classroom-edit-btn" type="button" data-edit-classroom="${c.id}">Edit</button>
        </article>
    `).join('') : '<div class="empty-card">No matching classrooms.</div>';
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
    `).join('') : '<div class="empty-card">No sections found.</div>';
    els.sectionSummary.textContent = activeSectionId
        ? `${sectionStudents.length} student${sectionStudents.length === 1 ? '' : 's'} in ${sectionLabel(classSections.find(section => section.id === activeSectionId) || {})}`
        : 'Select a section to view students.';
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
        ` : '<div class="empty-card">No students found in this section.</div>'
        : '';
    document.querySelectorAll('[data-section]').forEach(btn => {
        btn.addEventListener('click', () => loadStudentsForSection(btn.dataset.section));
    });
}

function openClassroomCreator(options = {}) {
    const modal = options.modal !== false;
    els.editClassroomTitle.textContent = 'Create Classroom';
    els.editClassroomId.value = '';
    els.editClassroomName.value = '';
    els.editClassCode.value = generateClassCode();
    renderSectionOptions();
    els.editClassEnabled.checked = true;
    els.editQuestionBankList.innerHTML = `
        <option value="">No question list</option>
        ${questionBankLists.map(list => `<option value="${esc(list.id)}">${esc(list.name || list.id)}</option>`).join('')}
    `;
    els.editQuestionBankList.value = '';
    els.saveClassroomBtn.textContent = 'Create Classroom';
    if (modal) els.classroomDialog.showModal();
    else els.classroomDialog.show();
}

function ensureClassroomCreatorOpen() {
    if (!els.classroomDialog.open) openClassroomCreator({ modal: false });
}

function renderSectionOptions(selectedSectionId = '', selectedSectionName = '') {
    const hasExistingSection = selectedSectionId && !classSections.some(section => section.id === selectedSectionId);
    els.editSectionId.innerHTML = `
        <option value="">No section</option>
        ${hasExistingSection ? `<option value="${esc(selectedSectionId)}">${esc(selectedSectionName || selectedSectionId)}</option>` : ''}
        ${classSections.map(section => `<option value="${esc(section.id)}">${esc(sectionLabel(section))}</option>`).join('')}
    `;
    els.editSectionId.value = selectedSectionId || '';
}

function openClassroomEditor(classroomId) {
    const classroom = classrooms.find(c => c.id === classroomId);
    if (!classroom) return;
    els.editClassroomTitle.textContent = `Edit ${classroom.className || classroom.classCode || classroom.id}`;
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
    els.saveClassroomBtn.textContent = 'Save Classroom';
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
    }
    if (selectedList) updates.questionBankListId = selectedList.id;
    else updates.questionBankListId = deleteField();

    if (!classroom) {
        await createClassroom(updates, selectedList, selectedSection);
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
        }
        if (!selectedList) delete classroom.questionBankListId;
        els.classroomDialog.close();
        render();
        toast('Classroom updated');
    } catch (error) {
        toast(error.message || 'Unable to update classroom');
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
        setStatus('Classroom created');
        toast('Classroom created');
    } catch (error) {
        toast(error.message || 'Unable to create classroom');
    }
}

function renderSelectedClassroom() {
    const classroom = classrooms.find(c => c.id === activeClassroomId);
    if (!classroom) {
        els.selectedClassroomTitle.textContent = 'Select a classroom';
        els.selectedClassroomMeta.textContent = '';
        els.enabledChip.textContent = 'No classroom';
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
    els.selectedClassroomMeta.textContent = `Code ${classroom.classCode || classroom.id} · ${classroom.sectionName || classroom.sectionId || 'No section'} · ${questionListName(classroom.questionBankListId)} · ${filtered.length} filtered`;
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
    els.submissionSummary.textContent = `${filtered.length} visible of ${submissions.length} loaded submissions`;
    els.tableViewBtn.classList.toggle('active', submissionViewMode === 'table');
    els.cardViewBtn.classList.toggle('active', submissionViewMode === 'cards');
    els.submissionList.className = submissionViewMode === 'table' ? 'submission-table-wrap' : 'submission-list';
    els.submissionList.innerHTML = filtered.length
        ? submissionViewMode === 'table' ? submissionTable(filtered) : filtered.map(submissionCard).join('')
        : '<div class="empty-card">No submissions match these filters.</div>';
    document.querySelectorAll('[data-detail]').forEach(btn => {
        btn.addEventListener('click', () => openSubmissionDetail(btn.dataset.detail));
    });
    document.querySelectorAll('[data-question-index]').forEach(btn => {
        btn.addEventListener('click', () => openQuestionDetail(Number(btn.dataset.questionIndex)));
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
                    <th scope="col">Student</th>
                    <th scope="col">Roll</th>
                    ${questionHeaders}
                    <th scope="col">Score</th>
                    <th scope="col">Review</th>
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
                        <td>${scorePercent(s)}%</td>
                        <td>${manualCount(s) ? esc(`${manualCount(s)} manual`) : ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function answerCell(answer) {
    const state = answerState(answer);
    return `<td class="answer-cell ${state.className}" title="${esc(state.title)}">${esc(state.label)}</td>`;
}

function openQuestionDetail(index) {
    const visible = filteredSubmissions();
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
    els.questionResponseList.innerHTML = responses.map(({ submission, answer: itemAnswer }) => {
        const state = answerState(itemAnswer);
        return `
            <article class="question-response-row">
                <div>
                    <strong>${esc(submission.studentName || 'Student')}</strong>
                    <p>${esc(submission.admissionNo || '')}</p>
                </div>
                <span class="answer-pill ${state.className}">${esc(state.label || state.title)}</span>
            </article>
        `;
    }).join('');
    renderRich(els.questionPrompt);
    els.questionDialog.showModal();
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
    const classroom = classrooms.find(c => c.id === activeClassroomId) || {};
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
    const gradable = Number(submission.gradableCount || 0);
    if (!gradable) return 0;
    return Math.round((Number(submission.correctCount || 0) / gradable) * 100);
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

function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}
