(function() {
    // 1. 기존 CSS와 충돌 없는 독립된 스타일 주입
    const style = document.createElement('style');
    style.textContent = `
        html, body { margin: 0; padding: 0; }
        body { padding-top: 70px !important; } /* 무조건 본문을 70px 아래로 밀어버림 */
        .portfolio-fixed-header {
            position: fixed !important; top: 0 !important; left: 0 !important; 
            width: 100% !important; height: 70px !important;
            background-color: rgba(255, 255, 255, 0.98) !important; 
            border-bottom: 1px solid #e2e8f0 !important;
            display: flex !important; align-items: center !important; 
            justify-content: space-between !important;
            padding: 0 30px !important; z-index: 999999 !important; /* 무조건 맨 위로 */
            box-shadow: 0 2px 10px rgba(226, 232, 240, 0.4) !important;
            box-sizing: border-box !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        }
        .portfolio-back-btn {
            display: flex !important; align-items: center !important; 
            text-decoration: none !important;
            color: #3182ce !important; font-size: 15px !important; 
            font-weight: 700 !important; user-select: none !important;
        }
        .portfolio-back-btn:hover { color: #2b6cb0 !important; }
        .portfolio-header-title { 
            font-size: 18px !important; font-weight: 700 !important; 
            color: #2d3748 !important; position: absolute !important; 
            left: 50% !important; transform: translateX(-50%) !important; 
        }
        @media (max-width: 900px) { .portfolio-header-title { display: none !important; } }
    `;
    document.head.appendChild(style);

    // 2. 화면 로드가 끝났든 안 끝났든 body가 생기면 무조건 맨 위에 꼽아넣는 로직
    const injectHeader = () => {
        if (document.querySelector('.portfolio-fixed-header')) return; // 중복 삽입 방지
        const headerHtml = `
            <div class="portfolio-fixed-header">
                <a href="../index.html" class="portfolio-back-btn">← 메인화면으로 돌아가기</a>
                <div class="portfolio-header-title">활동 결과 보고서</div>
                <div style="width:150px;"></div>
            </div>
        `;
        document.body.insertAdjacentHTML('afterbegin', headerHtml);
    };

    // body가 이미 있으면 바로 넣고, 없으면 대기했다가 넣기
    if (document.body) {
        injectHeader();
    } else {
        window.addEventListener('DOMContentLoaded', injectHeader);
    }
})();