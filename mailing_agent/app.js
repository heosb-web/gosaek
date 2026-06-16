// ============================================================
// app.js — 상태(state) · TAO 기록 · 메시지 UI · 이벤트 · 메인 로직
// ============================================================

// ============================================================
// 1. 상태 (State)
// ============================================================
const state = {
    goal: '사용자의 요청을 바탕으로 메일을 작성하고 Mock 발송 결과를 보여준다',
    plan: 'composeMail → showPreview → sendMail (안전 규칙 적용)',
    tools: {
        composeMail: { name: 'composeMail', type: '자유', desc: '메일 내용을 채팅에 작성' },
        showPreview: { name: 'showPreview', type: '자유', desc: '메일 미리보기 카드 제공 + 승인 버튼' },
        sendMail: { name: 'sendMail', type: '승인', desc: 'Mock 발송 (미리보기 승인 필수)' }
    },
    // 현재 세션 상태
    userRequest: '',
    to: null,
    subject: null,
    body: null,
    missingInfo: [],
    draft: null,
    sendResult: null,
    step: 'idle', // idle | asking | preview | confirm | sending | done
    waitingForUser: false,
    currentQuestion: null,
    // 중지 플래그
    stopRequested: false,
    // TAO 기록
    taoHistory: [],
    taoTurn: 0
};

// ============================================================
// 2. DOM 참조
// ============================================================
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const typingIndicator = document.getElementById('typingIndicator');
const themeToggle = document.getElementById('themeToggle');
const taoToggle = document.getElementById('taoToggle');
const taoPanel = document.getElementById('taoPanel');
const taoPanelBody = document.getElementById('taoPanelBody');
const stopButton = document.getElementById('stopButton');

// ============================================================
// 3. 유틸리티
// ============================================================
function getTimeStr() {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' +
           now.getMinutes().toString().padStart(2, '0') + ':' +
           now.getSeconds().toString().padStart(2, '0');
}

function scrollToBottom() {
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 50);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 4. 메시지 추가
// ============================================================
function addMessage(text, isUser = false, extraHTML = '') {
    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user' : 'bot'}`;
    div.innerHTML = `
        <div class="message-avatar">${isUser ? '👤' : '🤖'}</div>
        <div class="message-content">
            <p>${text.replace(/\n/g, '<br>')}</p>
            ${extraHTML}
            <span class="message-time">${getTimeStr()}</span>
        </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
    return div;
}

function addAgentMessage(text, taoHTML = '', extraHTML = '') {
    const div = document.createElement('div');
    div.className = 'message bot';
    let content = `<p>${text.replace(/\n/g, '<br>')}</p>`;
    if (taoHTML) content += taoHTML;
    if (extraHTML) content += extraHTML;
    div.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            ${content}
            <span class="message-time">${getTimeStr()}</span>
        </div>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
    return div;
}

// ============================================================
// 5. TAO 기록
// ============================================================
function recordTao(thought, actionName, actionDesc, observation) {
    state.taoTurn++;
    const entry = {
        turn: state.taoTurn,
        timestamp: getTimeStr(),
        thought: thought,
        action: {
            tool: actionName,
            status: actionDesc.startsWith('✅') || actionDesc.startsWith('성공') ? 'success' :
                    actionDesc.startsWith('거부') || actionDesc.startsWith('❌') || actionDesc.startsWith('🚫') ? 'rejected' : 'info',
            detail: actionDesc
        },
        observation: observation,
        guardrail: null
    };
    state.taoHistory.push(entry);
    addTaoEntry(entry);
}

function createTaoHTML(thought, actionName, actionDesc, observation) {
    const badgeMap = {
        composeMail: 'composeemail',
        showPreview: 'showpreview',
        sendMail: 'sendemail',
        askUser: 'askuser'
    };
    const badgeClass = badgeMap[actionName] || '';
    const toolIcon = actionName === 'composeMail' ? '✏️' :
                     actionName === 'showPreview' ? '📋' :
                     actionName === 'sendMail' ? '📤' :
                     actionName === 'askUser' ? '❓' : '🔧';

    return `
        <div class="tao-record">
            <div class="tao-line">
                <span class="tao-icon">🧠</span>
                <span class="tao-thought"><strong>Thought:</strong> ${thought}</span>
            </div>
            <div class="tao-line">
                <span class="tao-icon">⚡</span>
                <span class="tao-action">
                    <strong>Action:</strong>
                    <span class="tool-badge ${badgeClass}">${toolIcon} ${actionName}</span>
                    ${actionDesc}
                </span>
            </div>
            <div class="tao-line">
                <span class="tao-icon">👀</span>
                <span class="tao-observation"><strong>Observation:</strong> ${observation}</span>
            </div>
        </div>
    `;
}

// ============================================================
// 6. TAO 패널 렌더링
// ============================================================
function addTaoEntry(entry) {
    const div = document.createElement('div');
    div.className = `tao-entry ${entry.action.status === 'rejected' ? 'rejected' : ''}`;

    const statusIcon = entry.action.status === 'success' ? '✅' :
                       entry.action.status === 'rejected' ? '❌' : 'ℹ️';

    div.innerHTML = `
        <div class="tao-turn">#${entry.turn} · ${entry.timestamp}</div>
        <div class="tao-line">
            <span class="tao-label tao-thought">💭 Thought:</span>
            ${entry.thought}
        </div>
        <div class="tao-line">
            <span class="tao-label tao-action">⚡ Action:</span>
            ${statusIcon} ${entry.action.tool}
            <span style="color:#888;font-size:0.75rem;">${entry.action.detail}</span>
        </div>
        <div class="tao-line">
            <span class="tao-label tao-observation">👀 Observation:</span>
            ${entry.observation}
        </div>
        ${entry.guardrail ? `<div class="tao-line" style="color:#e53935;">🛡️ Guardrail: ${entry.guardrail}</div>` : ''}
    `;

    taoPanelBody.appendChild(div);
    taoPanelBody.scrollTop = taoPanelBody.scrollHeight;
}

function toggleTaoPanel() {
    taoPanel.classList.toggle('open');
    taoToggle.classList.toggle('active');
    taoToggle.textContent = taoPanel.classList.contains('open') ? '🧠' : '🧠';
}

function exportTaoLog() {
    if (state.taoHistory.length === 0) {
        addAgentMessage('📭 내보낼 TAO 로그가 없습니다.');
        return;
    }

    const header = '🧠 TAO 로그 (메일링 에이전트 AI)\n';
    const date = `📅 ${new Date().toLocaleString('ko-KR')}\n`;
    const sep = '='.repeat(50) + '\n\n';

    const log = state.taoHistory.map(t => {
        return `[#${t.turn}] ${t.timestamp}
💭 Thought: ${t.thought}
⚡ Action: ${t.action.tool} (${t.action.status})
👀 Observation: ${t.observation}
${t.guardrail ? `🛡️ Guardrail: ${t.guardrail}` : ''}
---`;
    }).join('\n\n');

    const fullLog = header + date + sep + log + '\n\n=== End of Log ===';

    const blob = new Blob([fullLog], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `tao-log-${today}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addAgentMessage(`📥 TAO 로그가 다운로드되었습니다. (${state.taoHistory.length}개 항목)`);
}

// ============================================================
// 7. 중지 기능 (Stop)
// ============================================================
function requestStop() {
    state.stopRequested = true;
    hideTyping();
    setInputEnabled(true);

    // 상태 초기화
    state.step = 'idle';
    state.waitingForUser = false;
    clearPreviewApproval();

    addAgentMessage('🛑 작업이 중지되었습니다. 새로운 요청을 입력해주세요.');

    recordTao(
        '사용자가 중지 버튼을 클릭했습니다.',
        'stop',
        '모든 추론 및 행동 중단',
        '작업이 중지되었습니다. 사용자 입력 대기 중...'
    );

    userInput.placeholder = '메일 요청을 입력하세요...';
    userInput.focus();

    // 3초 후 플래그 자동 리셋
    setTimeout(() => {
        state.stopRequested = false;
    }, 3000);
}

function handleStopInternal() {
    hideTyping();
    setInputEnabled(true);
    state.step = 'idle';
    state.waitingForUser = false;
    userInput.placeholder = '메일 요청을 입력하세요...';
}

// ============================================================
// 8. 입력 제어
// ============================================================
function setInputEnabled(enabled) {
    userInput.disabled = !enabled;
    sendButton.disabled = !enabled;
    if (enabled) {
        userInput.focus();
    }
}

function showTyping() {
    typingIndicator.classList.add('active');
    scrollToBottom();
}

function hideTyping() {
    typingIndicator.classList.remove('active');
}

// ============================================================
// 9. 에이전트 메인 로직
// ============================================================
function isEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function getDefaultSubject(request) {
    const cleaned = request.replace(/[에게]/g, '').trim();
    if (cleaned.length > 20) return cleaned.substring(0, 20) + '...';
    return cleaned;
}

function getDefaultBody(request) {
    return `안녕하세요,\n\n${request}\n\n감사합니다.`;
}

function extractEmailFromRequest(request) {
    // 입력에서 이메일 주소 추출
    const emailMatch = request.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return emailMatch ? emailMatch[0] : null;
}

function findFriendByName(name) {
    // 이름으로 친구 이메일 찾기 (간단한 매핑)
    const nameMap = {
        '써니': 'sunny.icmhs@gamil.com',
        'sunny': 'sunny.icmhs@gamil.com',
        '김가온': '2025gs11023@gosaek.hs.kr',
        '가온': '2025gs11023@gosaek.hs.kr',
        '박다인': '2026gs20913@gosaek.hs.kr',
        '다인': '2026gs20913@gosaek.hs.kr',
        '이다인': '2026gs20914@gosaek.hs.kr',
        '이다인2': '2026gs20511@gosaek.hs.kr',
        '프리': 'wwwfree50sun2@gmail.com'
    };
    const lowerName = name.trim().toLowerCase();
    return nameMap[lowerName] || null;
}

async function processUserInput(input) {
    // 🛑 중지 버튼 확인
    if (state.stopRequested) {
        handleStopInternal();
        return;
    }

    // 🛡️ 가드레일 4: 입력 검증
    const inputGuard = guardInput(input);
    if (!inputGuard.allowed) {
        const warningHTML = `
            <div class="safety-warning">
                <div><span class="safety-icon">🚫</span> <span class="safety-reason">${inputGuard.reason}</span></div>
                ${inputGuard.alternative ? `<div class="safety-alternative">💡 ${inputGuard.alternative}</div>` : ''}
            </div>
        `;
        addAgentMessage('입력을 확인해주세요.', '', warningHTML);
        recordTao(
            `입력 검증 실패: ${inputGuard.reason}`,
            'inputFilter',
            `거부됨`,
            inputGuard.reason
        );
        return;
    }

    // 🛡️ 가드레일 5: 콘텐츠 안전 검사
    const safetyGuard = guardContentSafety(input);
    if (!safetyGuard.allowed) {
        const warningHTML = `
            <div class="safety-warning">
                <div><span class="safety-icon">🚫</span> <span class="safety-reason">${safetyGuard.reason}</span></div>
                ${safetyGuard.alternative ? `<div class="safety-alternative">💡 ${safetyGuard.alternative}</div>` : ''}
            </div>
        `;
        addAgentMessage('🚫 요청을 거부합니다.', '', warningHTML);
        recordTao(
            `콘텐츠 안전 위반: ${safetyGuard.reason}`,
            'contentFilter',
            `거부됨`,
            safetyGuard.reason
        );
        return;
    }

    // 사용자 메시지 표시
    addMessage(input, true);

    showTyping();
    await sleep(600 + Math.random() * 600);

    // 요청 분석 (Thought)
    const thought = `사용자가 메일 작성을 요청했습니다: "${input}". 요청을 분석하여 필요한 정보를 추출합니다.`;

    // 이메일 주소 추출 시도
    let to = extractEmailFromRequest(input);

    // 이름으로 친구 찾기 시도
    if (!to) {
        const toMatch = input.match(/([^\s]+)에게/);
        if (toMatch) {
            to = findFriendByName(toMatch[1]);
        }
    }

    // 기본값 설정
    const subject = getDefaultSubject(input);
    const body = getDefaultBody(input);

    hideTyping();
    await sleep(300);

    if (to && isEmail(to)) {
        // 이메일을 찾은 경우 → 바로 composeMail → showPreview
        recordTao(
            thought,
            'composeMail',
            `수신자: ${to} | 제목: "${subject}"`,
            '메일 내용 작성 완료'
        );

        await sleep(300);
        composeMail(to, subject, body);

        await sleep(500);
        showPreview(to, subject, body);
    } else {
        // 이메일을 찾지 못한 경우 → askUser (부족한 정보 질문)
        const question = to ?
            `"${to}"은(는) 올바른 이메일 주소 형식이 아닙니다. 받는 사람의 이메일 주소가 무엇인가요?` :
            '받는 사람의 이메일 주소가 무엇인가요?';

        recordTao(
            thought,
            'askUser',
            `첫 질문: "${question}"`,
            '사용자의 답변을 기다리는 중...'
        );

        const taoHTML = createTaoHTML(thought, 'askUser', `첫 질문: "${question}"`, '사용자의 답변을 기다리는 중...');
        addAgentMessage('📋 메일 작성을 위해 필요한 정보를 수집하겠습니다.', taoHTML, `<p style="margin-top:6px;font-weight:600;">❓ ${question}</p>`);

        state.step = 'asking';
        state.waitingForUser = true;
        state.currentQuestion = question;
        state.missingInfo = ['받는 사람 이메일 주소'];
        userInput.placeholder = '답변을 입력하세요...';
        userInput.focus();
    }
}

// ============================================================
// 10. askUser 응답 처리
// ============================================================
async function handleAskUserResponse(input) {
    if (state.stopRequested) {
        handleStopInternal();
        return;
    }

    // 🛡️ 가드레일 4 + 5 검증
    const inputGuard = guardInput(input);
    if (!inputGuard.allowed) {
        const warningHTML = `
            <div class="safety-warning">
                <div><span class="safety-icon">🚫</span> <span class="safety-reason">${inputGuard.reason}</span></div>
                ${inputGuard.alternative ? `<div class="safety-alternative">💡 ${inputGuard.alternative}</div>` : ''}
            </div>
        `;
        addAgentMessage('입력을 확인해주세요.', '', warningHTML);
        return;
    }

    const safetyGuard = guardContentSafety(input);
    if (!safetyGuard.allowed) {
        const warningHTML = `
            <div class="safety-warning">
                <div><span class="safety-icon">🚫</span> <span class="safety-reason">${safetyGuard.reason}</span></div>
                ${safetyGuard.alternative ? `<div class="safety-alternative">💡 ${safetyGuard.alternative}</div>` : ''}
            </div>
        `;
        addAgentMessage('🚫 요청을 거부합니다.', '', warningHTML);
        return;
    }

    state.waitingForUser = false;
    const question = state.currentQuestion;

    // 사용자 메시지 표시
    addMessage(input, true);

    showTyping();
    await sleep(500 + Math.random() * 500);

    // 질문에 따라 상태 업데이트
    if (question.includes('이메일') || question.includes('메일 주소') || question.includes('받는 사람')) {
        if (isEmail(input)) {
            state.to = input;
            state.missingInfo = state.missingInfo.filter(i => !i.includes('받는 사람'));
        } else {
            // 이름으로 친구 찾기
            const found = findFriendByName(input);
            if (found) {
                state.to = found;
                state.missingInfo = state.missingInfo.filter(i => !i.includes('받는 사람'));
            } else {
                hideTyping();
                const retryQuestion = `올바른 이메일 주소를 입력해주세요. (예: example@email.com)`;
                state.waitingForUser = true;
                state.currentQuestion = retryQuestion;
                addAgentMessage(`❓ ${retryQuestion}`);
                userInput.placeholder = '이메일 주소를 입력하세요...';
                userInput.focus();
                return;
            }
        }
    } else if (question.includes('제목')) {
        state.subject = input;
        state.missingInfo = state.missingInfo.filter(i => !i.includes('제목'));
    } else if (question.includes('본문') || question.includes('내용')) {
        state.body = input;
        state.missingInfo = state.missingInfo.filter(i => !i.includes('본문'));
    }

    // 다음 단계 결정
    if (!state.to) {
        if (!state.missingInfo.includes('받는 사람 이메일 주소')) {
            state.missingInfo.push('받는 사람 이메일 주소');
        }
    }
    if (!state.subject) {
        if (!state.missingInfo.includes('메일 제목')) {
            state.missingInfo.push('메일 제목');
        }
    }
    if (!state.body) {
        if (!state.missingInfo.includes('메일 본문 내용')) {
            state.missingInfo.push('메일 본문 내용');
        }
    }

    if (state.missingInfo.length > 0) {
        const nextQ = `${state.missingInfo[0]}가 무엇인가요?`;
        hideTyping();

        const thought = `아직 "${state.missingInfo[0]}" 정보가 부족합니다.`;
        recordTao(thought, 'askUser', `질문: "${nextQ}"`, '사용자의 답변을 기다리는 중...');

        const taoHTML = createTaoHTML(thought, 'askUser', `질문: "${nextQ}"`, '사용자의 답변을 기다리는 중...');
        addAgentMessage('📋 추가 정보가 필요합니다.', taoHTML, `<p style="margin-top:6px;font-weight:600;">❓ ${nextQ}</p>`);

        state.step = 'asking';
        state.waitingForUser = true;
        state.currentQuestion = nextQ;
        userInput.placeholder = '답변을 입력하세요...';
        userInput.focus();
    } else {
        // 모든 정보 수집 완료 → composeMail → showPreview
        hideTyping();
        await sleep(400);

        const subject = state.subject || getDefaultSubject(state.userRequest);
        const body = state.body || getDefaultBody(state.userRequest);

        recordTao(
            `모든 정보가 수집되었습니다. 메일을 작성합니다.`,
            'composeMail',
            `→ ${state.to} | "${subject}"`,
            '메일 내용 작성 완료'
        );

        composeMail(state.to, subject, body);

        await sleep(500);
        showPreview(state.to, subject, body);
    }
}

// ============================================================
// 11. 이벤트 핸들러
// ============================================================
async function handleSend() {
    if (state.stopRequested) {
        addAgentMessage('⏳ 현재 중지 처리 중입니다. 잠시만 기다려주세요.');
        return;
    }

    const message = userInput.value.trim();
    if (!message) return;
    if (sendButton.disabled) return;

    userInput.value = '';

    // waitingForUser 상태면 askUser 응답 처리
    if (state.waitingForUser && state.step === 'asking') {
        await handleAskUserResponse(message);
    } else if (state.step === 'idle' || state.step === 'done') {
        await processUserInput(message);
    } else {
        addAgentMessage('⏳ 현재 작업을 처리 중입니다. 잠시만 기다려주세요.');
    }
}

sendButton.addEventListener('click', handleSend);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});

// 다크모드
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    themeToggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
});

// TAO 패널 토글
taoToggle.addEventListener('click', toggleTaoPanel);

// 중지 버튼
stopButton.addEventListener('click', requestStop);

// ============================================================
// 12. 시작 가이드
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    const systemInfoHTML = `
        <div style="font-size:0.78rem;background:#f8f9fa;border-radius:6px;padding:8px 10px;margin-top:6px;border:1px solid #eee;">
            <div style="font-weight:600;margin-bottom:4px;">📋 에이전트 5요소 + 안전 규칙</div>
            <div>🎯 <strong>목표:</strong> 사용자 요청 → 메일 작성 → Mock 발송</div>
            <div>📋 <strong>계획:</strong> composeMail → showPreview → sendMail</div>
            <div>🔧 <strong>도구:</strong> composeMail ✏️ / showPreview 📋 / sendMail 📤</div>
            <div style="margin-top:4px;color:#e53935;">🛡️ <strong>안전 규칙 적용 중</strong></div>
            <div style="color:#555;">✓ 허용 도구만 사용 가능</div>
            <div style="color:#555;">✓ 친구 메일로만 발송 가능</div>
            <div style="color:#555;">✓ 발송 전 미리보기 + 승인 필수</div>
            <div style="color:#555;">✓ 동일 도구 최대 5회 재시도</div>
            <div style="color:#555;">✓ 비상 중지 가능</div>
            <div style="color:#555;">✓ 욕설·차별·기만·탈옥 입력 거부</div>
        </div>
    `;
    const firstMsg = document.querySelector('.message.bot .message-content');
    if (firstMsg) {
        firstMsg.innerHTML += systemInfoHTML;
    }
});