# 🛡️ 메일링 에이전트 AI — 안전 정책 (Safety Policy)

> **적용 대상:** 메일링 에이전트 AI (Mailing Agent)
> **버전:** 1.0.0
> **최종 업데이트:** 2026-06-16

---

## 1. 도구 허용 목록 (Tool Allowlist)

에이전트는 아래 3가지 도구만 실행할 수 있습니다. 이 외의 도구 호출은 모두 차단됩니다.

| 도구명 | 등급 | 설명 |
|--------|------|------|
| `composeMail` | 🟢 자유 (auto) | 메일 내용을 채팅에 포맷팅하여 출력 |
| `showPreview` | 🟢 자유 (auto) | 받는 사람·제목·내용을 카드 UI로 표시 + [확인]/[취소] 버튼 |
| `sendMail` | 🔴 승인 (ask) | 실제 Mock 발송 실행 (미리보기 승인 필수) |

**코드 적용:** `guardrails.js` → `ALLOWED_TOOLS` 배열 + `guardToolCall()` 함수

---

## 2. 수신자 검증 (Friend Only)

메일 발송은 등록된 친구 메일 주소로만 가능합니다.

### 친구 메일 주소 목록

| # | 메일 주소 |
|---|-----------|
| 1 | sunny.icmhs@gamil.com |
| 2 | 2025gs11023@gosaek.hs.kr |
| 3 | 2026gs20913@gosaek.hs.kr |
| 4 | 2026gs20914@gosaek.hs.kr |
| 5 | 2026gs20511@gosaek.hs.kr |
| 6 | wwwfree50sun2@gmail.com |

**코드 적용:** `guardrails.js` → `FRIEND_EMAILS` 배열 + `guardRecipient()` 함수

---

## 3. sendMail 권한 제한 (Write-only)

`sendMail` 도구는 **발송(write)만** 가능합니다.

| 동작 | 허용 여부 |
|------|----------|
| 메일 발송 (write) | ✅ 허용 |
| 메일 읽기 (read) | ❌ 차단 |
| 메일 삭제 (delete) | ❌ 차단 |
| 기타 조작 | ❌ 차단 |

**코드 적용:** `guardrails.js` → `guardSendMail()` 함수

---

## 4. 입력 검증 (Input Validation)

사용자의 모든 입력은 전처리 과정을 거칩니다.

| 검사 항목 | 기준 | 위반 시 조치 |
|-----------|------|-------------|
| 빈 입력 | 공백만 있는 입력 | 거부 + 안내 메시지 |
| 길이 제한 | 500자 초과 | 거부 + 500자 이내 요청 안내 |
| 프롬프트 인젝션 | 시스템 명령 무시, 지침 초기화, 역할극 등 | 거부 + 대안 제시 |

**코드 적용:** `guardrails.js` → `guardInput()` 함수

---

## 5. 콘텐츠 안전 (Content Safety) — 4종 금지

| 유형 | 설명 | 예시 |
|------|------|------|
| **욕설·비방** | 남을 직접 깎아내리는 표현 | 욕설, 비하, 모욕적 언어 |
| **차별·혐오** | 성별·인종·문화·집단 차별 | 직설적이지 않아도 맥락상 차별이면 거부 |
| **거짓·기만** | 사칭, 허위 사유로 메일 작성 요청 | 타인 사칭, 가짜 정보 유포 |
| **탈옥·우회** | 안전 규칙 무력화 시도 | "규칙 무시", "역할극 하자" 등 |

### 거부 메시지 형식 (3요소 포함)

```
🚫 요청을 거부합니다.
📛 [사유: 한 줄 설명]
💡 [건전한 대안 제시]
```

**코드 적용:** `guardrails.js` → `guardContentSafety()` 함수

---

## 6. sendMail 호출 전 showPreview 승인 게이트

`sendMail`은 반드시 `showPreview`에서 사용자가 [✅ 확인] 버튼을 누른 후에만 실행됩니다.

```
사용자 입력 → composeMail → showPreview (카드 UI + [확인]/[취소])
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                         [✅ 확인]                [✏️ 취소]
                              │                       │
                              ▼                       ▼
                     guardRecipient()           draft 초기화
                              │
                              ▼
                        sendMail 실행
```

**코드 적용:** `guardrails.js` → `_previewApproved` 플래그 + `requirePreviewApproval()`, `setPreviewApproval()`, `clearPreviewApproval()`
**코드 적용:** `tools.js` → `showPreview()` 내 `window.__confirmPreview` / `window.__cancelPreview`

---

## 7. 재시도 제한 (Retry Limit)

동일 도구에 대해 최대 **5회**까지만 재시도합니다.

| 조건 | 동작 |
|------|------|
| 도구 실행 성공 | 시도 횟수 리셋, 정상 진행 |
| 도구 실행 실패 (1~4회) | 실패 내용을 그대로 보고, 사용자에게 [🔄 다시 시도] / [❌ 종료] 선택권 제공 |
| 도구 실행 실패 (5회 초과) | 최종 실패 메시지 출력, 상태 초기화 |
| **결과 지어내지 않음** | 도구가 반환한 값 또는 에러 메시지를 **있는 그대로** 출력 |

**코드 적용:** `tools.js` → `executeWithRetry()` + `_attemptMap`

---

## 8. 비상 정지 (Emergency Stop)

사용자는 언제든지 중지 버튼(🛑)을 눌러 모든 추론과 행동을 중단할 수 있습니다.

| 동작 | 설명 |
|------|------|
| 중지 버튼 클릭 | `state.stopRequested = true` 설정 |
| 모든 비동기 작업 중단 | typing indicator 숨김, 입력 활성화 |
| 상태 초기화 | `step = 'idle'`, `waitingForUser = false` |
| TAO 로깅 | 중지 사실을 TAO 로그에 기록 |
| 3초 후 자동 복구 | `stopRequested` 플래그 자동 리셋 |

**코드 적용:** `app.js` → `requestStop()`, `handleStopInternal()`, `state.stopRequested`

---

## 9. 정책과 코드 간 대응표

| 정책 항목 | 문서 위치 | 코드 위치 | 강제 방식 |
|-----------|---------|----------|----------|
| 도구 허용 목록 | §1 | `guardrails.js` → `guardToolCall()` | 미허용 도구 호출 시 즉시 차단 |
| 수신자 검증 | §2 | `guardrails.js` → `guardRecipient()` | sendMail 진입 전 검증 |
| sendMail write-only | §3 | `guardrails.js` → `guardSendMail()` | write 외 동작 차단 |
| 입력 검증 | §4 | `guardrails.js` → `guardInput()` | 길이·인젝션 패턴 검사 |
| 콘텐츠 안전 4종 | §5 | `guardrails.js` → `guardContentSafety()` | 패턴 매칭 → 거부 + 대안 제시 |
| sendMail 게이트 | §6 | `guardrails.js` → `requirePreviewApproval()` | showPreview 승인 없이 실행 불가 |
| 재시도 제한 | §7 | `tools.js` → `executeWithRetry()` | 최대 5회 + 결과 그대로 보고 |
| 비상 정지 | §8 | `app.js` → `requestStop()` | 모든 루프에서 플래그 검사 |
| TAO 로깅 | — | `app.js` → `recordTao()` + `addTaoEntry()` | 모든 턴 강제 로깅 |

---

> 이 안전 정책은 `SAFETY_POLICY.md` (문서)와 각 `.js` 파일 (코드) 양쪽에 동일한 규칙이 적용되어 있습니다.
> 문서와 코드 간 불일치가 발견되면 **코드**를 기준으로 합니다.