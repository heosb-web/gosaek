// ============================================================
// 🛡️ guardrails.js — 모든 안전 규칙 코드 강제 (순수 함수, 무의존)
// ============================================================

// ============================================================
// 가드레일 1: 도구 허용 목록 (Tool Allowlist)
// ============================================================
const ALLOWED_TOOLS = ['composeMail', 'showPreview', 'sendMail'];

function guardToolCall(toolName) {
    if (!ALLOWED_TOOLS.includes(toolName)) {
        return {
            allowed: false,
            reason: `"${toolName}" 도구는 사용할 수 없습니다. 허용 도구: composeMail, showPreview, sendMail`
        };
    }
    return { allowed: true };
}

// ============================================================
// 가드레일 2: 수신자 검증 (Friend Only)
// ============================================================
const FRIEND_EMAILS = [
    'sunny.icmhs@gamil.com',
    '2025gs11023@gosaek.hs.kr',
    '2026gs20913@gosaek.hs.kr',
    '2026gs20914@gosaek.hs.kr',
    '2026gs20511@gosaek.hs.kr',
    'wwwfree50sun2@gmail.com'
];

function guardRecipient(email) {
    const normalized = email.trim().toLowerCase();
    if (!FRIEND_EMAILS.includes(normalized)) {
        return {
            allowed: false,
            reason: `"${email}"은(는) 친구 목록에 없는 메일 주소입니다. 친구 메일로만 발송 가능합니다.`
        };
    }
    return { allowed: true };
}

// ============================================================
// 가드레일 3: sendMail 권한 (Write-only)
// ============================================================
function guardSendMail(action) {
    if (action !== 'write') {
        return {
            allowed: false,
            reason: 'sendMail은 발송(write)만 가능합니다. 메일 읽기·삭제는 불가능합니다.'
        };
    }
    return { allowed: true };
}

// ============================================================
// 가드레일 4: 입력 검증 (길이 제한 + 프롬프트 인젝션 방어)
// ============================================================
function guardInput(input) {
    if (!input || input.trim().length === 0) {
        return { allowed: false, reason: '입력이 비어있습니다.' };
    }

    if (input.length > 500) {
        return {
            allowed: false,
            reason: '입력이 500자를 초과했습니다.',
            alternative: '500자 이내로 줄여서 다시 요청해주세요.'
        };
    }

    // 프롬프트 인젝션 패턴
    const injectionPatterns = [
        /시스템.?명령/i, /지침.?잊어/i, /프롬프트.?초기화/i,
        /규칙.?무시/i, /명령.?취소/i, /초기화|리셋|리부트/i,
        /역할극|롤플레|챗봇.?벗어/i,
        /ignore.*instruction/i, /role.*play/i, /DAN|jailbreak/i,
        /bypass.*restriction/i
    ];

    for (const pattern of injectionPatterns) {
        if (pattern.test(input)) {
            return {
                allowed: false,
                reason: '안전 규칙을 우회하려는 시도로 감지되었습니다.',
                alternative: '메일 작성이 필요하시면 편하게 말씀해주세요. 도와드릴게요!'
            };
        }
    }

    return { allowed: true };
}

// ============================================================
// 가드레일 5: 콘텐츠 안전 4종 (순수 함수, TAO 로깅은 호출자에서)
//   1. 욕설·비방
//   2. 차별·혐오
//   3. 거짓·기만
//   4. 탈옥·우회
// ============================================================
function guardContentSafety(input) {
    const rules = [
        {
            id: 'abuse',
            patterns: [
                /시끼|미친|병신|등신|개새끼|좆|니미|엠창/i,
                /바보|멍청|무능|쓰레기|찌질|한심|더러운|디질/i
            ],
            reason: '욕설·비방 표현이 포함되어 있습니다.',
            alternative: '상대방을 존중하는 표현으로 바꿔서 메일을 작성해보는 건 어떨까요?'
        },
        {
            id: 'hate',
            patterns: [
                /여자는|여자라서|남자는|남자라서/i,
                /외국인.*때문|흑인|백인|동양인|서양인/i,
                /게이|레즈|트젠|호모/i,
                /정신병자|장애인.*못|장애.*때문/i,
                /특정.*민족|인종.*열등|문화.*후진/i
            ],
            reason: '차별·혐오로 볼 수 있는 표현이 포함되어 있습니다.',
            alternative: '모든 사람을 존중하는 표현으로 대신해보시겠어요?'
        },
        {
            id: 'deception',
            patterns: [
                /사칭|속여|거짓|허위|가짜|위조|사기/i,
                /바꿔치기|대신.*보내|몰래.*보내/i,
                /친구.*아닌|모르는.*사람|선생님.*사칭/i
            ],
            reason: '거짓·기만적인 메일 작성 요청으로 판단됩니다.',
            alternative: '진실된 내용으로 메일을 보내면 더 좋은 관계를 만들 수 있어요!'
        },
        {
            id: 'jailbreak',
            patterns: [
                /규칙.?무시|지침.?잊어|명령.?취소/i,
                /역할극|롤플레|챗봇.?벗어/i,
                /이전.?대화.?무시|시스템.?프롬프트/i,
                /ignore.*instruction|role.*play|DAN|jailbreak/i,
                /bypass.*restriction/i
            ],
            reason: '안전 규칙을 우회하려는 시도로 감지되었습니다.',
            alternative: '메일 작성이 필요하시면 편하게 말씀해주세요. 도와드릴게요!'
        }
    ];

    for (const rule of rules) {
        for (const pattern of rule.patterns) {
            if (pattern.test(input)) {
                return {
                    allowed: false,
                    ruleId: rule.id,
                    reason: rule.reason,
                    alternative: rule.alternative
                };
            }
        }
    }

    return { allowed: true };
}

// ============================================================
// 가드레일 6: sendMail 호출 전 showPreview 승인 게이트
// ============================================================
let _previewApproved = false;
let _previewDraft = null;

function requirePreviewApproval() {
    if (!_previewApproved || !_previewDraft) {
        return {
            allowed: false,
            reason: 'sendMail을 호출하기 전에 showPreview에서 [확인]을 먼저 눌러주세요.'
        };
    }
    return { allowed: true, draft: _previewDraft };
}

function setPreviewApproval(draft) {
    _previewDraft = draft;
    _previewApproved = true;
}

function clearPreviewApproval() {
    _previewApproved = false;
    _previewDraft = null;
}