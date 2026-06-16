// ============================================================
// 🔧 tools.js — 도구 정의 (composeMail / showPreview / sendMail)
// ============================================================

// ============================================================
// 도구 실행 재시도 맵 (도구별 시도 횟수 추적)
// ============================================================
const _attemptMap = {};

// ============================================================
// 도구 실행 래퍼 (재시도 + 실패 보고)
// ============================================================
async function executeWithRetry(toolName, toolFn, ...args) {
    // 🛡️ 가드레일 1: 도구 허용 목록 검사
    const toolGuard = guardToolCall(toolName);
    if (!toolGuard.allowed) {
        addAgentMessage(`🚫 ${toolGuard.reason}`);
        recordTao(
            `허용되지 않은 도구 "${toolName}" 호출 시도`,
            toolName,
            `거부됨`,
            toolGuard.reason
        );
        return null;
    }

    if (!_attemptMap[toolName]) _attemptMap[toolName] = 0;

    while (_attemptMap[toolName] < 5) {
        // 🛑 중지 버튼 확인
        if (state.stopRequested) {
            handleStopInternal();
            return null;
        }

        _attemptMap[toolName]++;

        try {
            const result = await toolFn(...args);

            // 성공 시 카운트 리셋
            if (result && result.success === true) {
                _attemptMap[toolName] = 0;
                recordTao(
                    `도구 "${toolName}" 실행 성공 (${_attemptMap[toolName]}회차)`,
                    toolName,
                    `성공`,
                    result
                );
                return result;
            }

            // ❌ 실패 — 결과를 절대 지어내지 않고 그대로 출력
            const errorMsg = (result && result.error) ? result.error : '알 수 없는 오류가 발생했습니다.';

            recordTao(
                `도구 "${toolName}" 실행 실패 (${_attemptMap[toolName]}/5)`,
                toolName,
                `실패: ${errorMsg}`,
                errorMsg
            );

            // 실패 내용을 사용자에게 있는 그대로 보고
            const failureHTML = `
                <div class="tool-failure">
                    <div><span class="failure-icon">⚠️</span> <strong>도구 실행 결과:</strong></div>
                    <div class="failure-error">${errorMsg}</div>
                </div>
                <div class="retry-buttons">
                    <button class="btn-retry" onclick="window.__retryTool('${toolName}')">🔄 다시 시도</button>
                    <button class="btn-exit" onclick="window.__exitTool()">❌ 종료</button>
                </div>
            `;

            addAgentMessage(`⚠️ "${toolName}" 실행 중 문제가 발생했습니다.`, '', failureHTML);

            // 사용자 선택 대기 (전역 콜백 사용)
            return new Promise((resolve) => {
                window.__retryTool = (name) => {
                    resolve(executeWithRetry(name, toolFn, ...args));
                };
                window.__exitTool = () => {
                    _attemptMap[toolName] = 0;
                    state.step = 'idle';
                    state.waitingForUser = false;
                    addAgentMessage('🛑 작업을 중단합니다. 새로 요청해주세요.');
                    recordTao(
                        '사용자가 도구 실패 후 종료를 선택함',
                        toolName,
                        `종료`,
                        '작업 중단됨'
                    );
                    resolve(null);
                };
            });

        } catch (err) {
            // 예외 발생 — 결과를 절대 지어내지 않음
            const errorMsg = err.message || '알 수 없는 오류가 발생했습니다.';

            recordTao(
                `도구 "${toolName}" 실행 중 예외 발생 (${_attemptMap[toolName]}/5)`,
                toolName,
                `예외: ${errorMsg}`,
                errorMsg
            );

            const failureHTML = `
                <div class="tool-failure">
                    <div><span class="failure-icon">⚠️</span> <strong>도구 실행 결과:</strong></div>
                    <div class="failure-error">${errorMsg}</div>
                </div>
                <div class="retry-buttons">
                    <button class="btn-retry" onclick="window.__retryTool('${toolName}')">🔄 다시 시도</button>
                    <button class="btn-exit" onclick="window.__exitTool()">❌ 종료</button>
                </div>
            `;

            addAgentMessage(`⚠️ "${toolName}" 실행 중 문제가 발생했습니다.`, '', failureHTML);

            return new Promise((resolve) => {
                window.__retryTool = (name) => {
                    resolve(executeWithRetry(name, toolFn, ...args));
                };
                window.__exitTool = () => {
                    _attemptMap[toolName] = 0;
                    state.step = 'idle';
                    state.waitingForUser = false;
                    addAgentMessage('🛑 작업을 중단합니다. 새로 요청해주세요.');
                    resolve(null);
                };
            });
        }
    }

    // 5회 모두 실패
    _attemptMap[toolName] = 0;
    const msg = `⚠️ "${toolName}" 도구가 5회 연속 실패했습니다.\n마지막 오류를 확인해주세요. 입력을 다시 확인하거나 다른 방식으로 요청해주세요.`;
    addAgentMessage(msg);
    recordTao(
        `도구 "${toolName}" 5회 모두 실패`,
        toolName,
        `최종 실패`,
        `5회 재시도 후 실패`
    );
    state.step = 'idle';
    return null;
}

// ============================================================
// 도구 1: composeMail (🟢 자동)
//   - 메일 내용을 포맷팅하여 채팅에 출력
// ============================================================
function composeMail(to, subject, body) {
    const draftHTML = `
        <div class="draft-preview">
            <div class="draft-label">📄 메일 내용</div>
            <div class="draft-field"><strong>받는 사람:</strong> <span class="draft-content">${escapeHtml(to)}</span></div>
            <div class="draft-field"><strong>제목:</strong> <span class="draft-content">${escapeHtml(subject)}</span></div>
            <div class="draft-field"><strong>본문:</strong></div>
            <div class="draft-content">${escapeHtml(body)}</div>
        </div>
    `;

    addAgentMessage('✍️ 메일 내용을 작성했습니다.', '', draftHTML);
    recordTao(
        `메일 내용 작성 완료`,
        'composeMail',
        `→ ${to} | "${subject}"`,
        '메일 내용이 채팅에 출력되었습니다.'
    );

    return { success: true, to, subject, body };
}

// ============================================================
// 도구 2: showPreview (🟢 자동)
//   - 받는 사람·제목·내용을 카드 UI로 표시 + [확인] [취소] 버튼
// ============================================================
function showPreview(to, subject, body) {
    const draft = { to, subject, body };

    const previewHTML = `
        <div class="draft-preview" style="border:2px solid #667eea;">
            <div class="draft-label">📬 메일 미리보기</div>
            <div class="draft-field"><strong>받는 사람:</strong> <span class="draft-content">${escapeHtml(to)}</span></div>
            <div class="draft-field"><strong>제목:</strong> <span class="draft-content">${escapeHtml(subject)}</span></div>
            <div class="draft-field"><strong>본문:</strong></div>
            <div class="draft-content" style="background:#f9f9fb;padding:8px;border-radius:4px;margin-top:4px;">${escapeHtml(body)}</div>
            <div class="confirm-buttons">
                <button class="btn-confirm" onclick="window.__confirmPreview()">✅ 확인</button>
                <button class="btn-cancel" onclick="window.__cancelPreview()">✏️ 취소</button>
            </div>
        </div>
    `;

    addAgentMessage('📋 메일을 발송하기 전에 확인해주세요.', '', previewHTML);
    recordTao(
        `메일 미리보기 표시`,
        'showPreview',
        `→ ${to} | "${subject}"`,
        '사용자의 확인을 기다리는 중...'
    );

    // 전역 승인 콜백
    window.__confirmPreview = function() {
        if (state.step === 'preview') {
            // 🛡️ 가드레일 2: 수신자 검증
            const r = guardRecipient(to);
            if (!r.allowed) {
                addAgentMessage(`🚫 ${r.reason}`);
                recordTao(
                    `수신자 검증 실패`,
                    'sendMail',
                    `거부됨`,
                    r.reason
                );
                clearPreviewApproval();
                state.step = 'idle';
                return;
            }

            // 승인 설정
            setPreviewApproval(draft);
            state.step = 'confirm';

            addAgentMessage('✅ 확인되었습니다. 메일을 발송합니다.');
            recordTao(
                `사용자가 미리보기 확인`,
                'showPreview',
                `승인됨`,
                'sendMail 실행 준비 완료'
            );

            // sendMail 자동 호출
            executeWithRetry('sendMail', () => mockSendMail(draft));
        }
    };

    window.__cancelPreview = function() {
        clearPreviewApproval();
        state.step = 'idle';
        state.waitingForUser = false;
        state.draft = null;
        addAgentMessage('✏️ 메일 작성을 취소했습니다. 다시 요청해주세요.');
        recordTao(
            `사용자가 미리보기 취소`,
            'showPreview',
            `취소됨`,
            '초안이 초기화되었습니다.'
        );
        userInput.placeholder = '메일 요청을 입력하세요...';
        userInput.focus();
    };

    state.step = 'preview';

    return { success: true, draft };
}

// ============================================================
// 도구 3: sendMail (🔴 승인) — Mock 발송
// ============================================================
function mockSendMail(draft) {
    // 🛡️ 가드레일 6: showPreview 승인 게이트
    const gate = requirePreviewApproval();
    if (!gate.allowed) {
        return { success: false, error: gate.reason };
    }

    // 🛡️ 가드레일 3: write-only 검증
    const w = guardSendMail('write');
    if (!w.allowed) {
        return { success: false, error: w.reason };
    }

    // 🛡️ 가드레일 2: 수신자 재검증
    const r = guardRecipient(draft.to);
    if (!r.allowed) {
        return { success: false, error: r.reason };
    }

    // Mock 발송 실행
    const messageId = 'MSG-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const sentAt = new Date().toISOString();

    const result = {
        success: true,
        messageId: messageId,
        sentAt: sentAt,
        to: draft.to,
        subject: draft.subject
    };
    state.sendResult = result;

    const resultHTML = `
        <div class="send-result success">
            <span class="result-icon">✅</span>
            <span class="result-msg">메일이 성공적으로 발송되었습니다!</span>
            <div class="result-detail">Message ID: ${messageId}</div>
            <div class="result-detail">받는 사람: ${draft.to}</div>
            <div class="result-detail">제목: ${draft.subject}</div>
            <div class="result-detail">발송 시간: ${new Date(sentAt).toLocaleString('ko-KR')}</div>
        </div>
    `;

    addAgentMessage('📤 메일을 발송했습니다.', '', resultHTML);
    recordTao(
        `사용자가 메일 발송 승인 → Mock 발송 실행`,
        'sendMail',
        `발송: → ${draft.to} | "${draft.subject}"`,
        `✅ 발송 성공! Message ID: ${messageId}`
    );

    state.step = 'done';
    clearPreviewApproval();
    userInput.placeholder = '새로운 메일 요청을 입력하세요...';
    userInput.focus();

    return result;
}

// ============================================================
// 유틸리티: HTML 이스케이프
// ============================================================
function escapeHtml(str) {
    if (!str) return '';
    // DOM 기반 이스케이프 (auto-formatter에 영향받지 않음)
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/\n/g, '<br>');
}
