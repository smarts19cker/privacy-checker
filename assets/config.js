/* =====================================================================
 * 설정 파일 — 초보자는 이 파일의 WORKER_URL 한 줄만 바꾸면 됩니다.
 * ===================================================================== */
window.APP_CONFIG = {
  // ① Cloudflare Worker 주소 (종합 가이드 5~6장). 비워 두면 'API 없이(토큰 0)' 모드로 동작합니다.
  //    예) 'https://privacy-agent.내아이디.workers.dev'
  WORKER_URL: 'https://privacy-agent.seowipo-soc.workers.dev/',

  // ② Worker가 없을 때 처리방침 페이지를 가져오기 위한 공개 프록시(순서대로 시도)
  PUBLIC_PROXIES: [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
    'https://api.codetabs.com/v1/proxy?quest='
  ],

  // ③ AI 사용 설정 (Worker에 Claude API 키가 등록된 경우에만 사용)
  AI: {
    model: 'claude-haiku-5-5',     // 가장 저렴한 모델(토큰 비용 최소)
    maxTokensFix: 1200,            // 개선문구 다듬기 최대 출력 토큰
    maxTokensAudience: 1800,       // 계층별 처리방침 1건당 최대 출력 토큰
    excerptChars: 350              // AI에 보내는 현행내용 발췌 길이(짧을수록 토큰 절약)
  }
};
