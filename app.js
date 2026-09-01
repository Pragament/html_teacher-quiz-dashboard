import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    collection,
    getDocs,
    getFirestore,
    query,
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
    classrooms: 'classrooms',
    submissions: 'qb_quiz_submissions_v1'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let classrooms = [];
let activeClassroomId = null;
let submissions = [];
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const els = {
    statusText: $('statusText'),
    loginBtn: $('loginBtn'),
    loginHeroBtn: $('loginHeroBtn'),
    logoutBtn: $('logoutBtn'),
    refreshBtn: $('refreshBtn'),
    loginView: $('loginView'),
    classroomPanel: $('classroomPanel'),
    dashboardView: $('dashboardView'),
    teacherLabel: $('teacherLabel'),
    classroomCount: $('classroomCount'),
    classroomList: $('classroomList'),
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
    toast: $('toast')
};

const filterIds = ['classroomSearch', 'studentSearch', 'subjectFilter', 'chapterFilter', 'resultFilter'];

if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
}

bindEvents();

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    els.loginBtn.hidden = !!user;
    els.loginHeroBtn.hidden = !!user;
    els.logoutBtn.hidden = !user;
    els.refreshBtn.hidden = !user;
    els.loginView.hidden = !!user;
    els.classroomPanel.hidden = !user;
    els.dashboardView.hidden = !user;
    if (!user) {
        classrooms = [];
        submissions = [];
        activeClassroomId = null;
        setStatus('Sign in to view your classrooms');
        render();
        return;
    }
    els.teacherLabel.textContent = user.displayName || user.email || user.uid;
    await loadClassrooms();
});

function bindEvents() {
    els.loginBtn.addEventListener('click', login);
    els.loginHeroBtn.addEventListener('click', login);
    els.logoutBtn.addEventListener('click', () => signOut(auth));
    els.refreshBtn.addEventListener('click', refreshActive);
    $('closeDetailBtn').addEventListener('click', () => els.detailDialog.close());
    $('exportCsvBtn').addEventListener('click', exportSubmissionsCsv);
    filterIds.forEach(id => $(id).addEventListener('input', render));
    filterIds.forEach(id => $(id).addEventListener('change', render));
}

async function login() {
    await signInWithPopup(auth, new GoogleAuthProvider());
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
        <button class="classroom-card ${c.id === activeClassroomId ? 'active' : ''}" data-classroom="${c.id}">
            <strong>${esc(c.className || c.classCode || c.id)}</strong>
            <span>${esc(c.sectionName || c.sectionId || 'No section')}</span>
            <span class="submission-meta">
                <span>Code ${esc(c.classCode || c.id)}</span>
                <span>${c.classEnabled === true ? 'Enabled' : 'Disabled'}</span>
            </span>
        </button>
    `).join('') : '<div class="empty-card">No matching classrooms.</div>';
    document.querySelectorAll('[data-classroom]').forEach(btn => {
        btn.addEventListener('click', () => loadSubmissionsForClassroom(btn.dataset.classroom));
    });
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
    els.selectedClassroomMeta.textContent = `Code ${classroom.classCode || classroom.id} · ${classroom.sectionName || classroom.sectionId || 'No section'} · ${filtered.length} filtered`;
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
    els.submissionList.innerHTML = filtered.length ? filtered.map(submissionCard).join('') : '<div class="empty-card">No submissions match these filters.</div>';
    document.querySelectorAll('[data-detail]').forEach(btn => {
        btn.addEventListener('click', () => openSubmissionDetail(btn.dataset.detail));
    });
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

function exportSubmissionsCsv() {
    const rows = [[
        'classroomId',
        'classCode',
        'sectionId',
        'studentName',
        'admissionNo',
        'submittedAt',
        'subject',
        'chapters',
        'questionCount',
        'answeredCount',
        'gradableCount',
        'correctCount',
        'scorePercent',
        'manualReviewCount'
    ]];
    const classroom = classrooms.find(c => c.id === activeClassroomId) || {};
    filteredSubmissions().forEach(s => {
        rows.push([
            s.classroomId || activeClassroomId || '',
            classroom.classCode || '',
            s.sectionId || classroom.sectionId || '',
            s.studentName || '',
            s.admissionNo || '',
            formatDate(s.submittedAtMillis),
            s.subject || '',
            (s.chapters || []).join('|'),
            s.questionCount || 0,
            s.answeredCount || 0,
            s.gradableCount || 0,
            s.correctCount || 0,
            scorePercent(s),
            manualCount(s)
        ]);
    });
    downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), 'teacher-quiz-submissions.csv');
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

function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleString();
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
