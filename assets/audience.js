/* =====================================================================
 * 계층별(어린이·청소년·어르신) 개인정보 처리방침 자동 생성
 *  - 기본: '개선된 처리방침'에서 핵심 사실을 뽑아 대상별 템플릿으로 작성(토큰 0)
 *  - 선택: 'AI로 더 쉽게' → 핵심 사실(facts)만 Claude API로 보내 다시 쓰기(토큰 최소)
 * ===================================================================== */
(function () {
  'use strict';
  const S = window.APP, C = window.APP_CONFIG;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAME = { child: '어린이용', teen: '청소년용', senior: '어르신용' };

  /* 대상별 화면 스타일(다운로드 HTML에도 그대로 들어감) */
  const AUD_CSS = `
.aud{border-radius:20px;padding:28px;color:#1b1b1b;font-family:'Noto Sans KR',system-ui,sans-serif;word-break:keep-all}
.aud h2{margin:0 0 6px;font-weight:900;line-height:1.3}
.aud .intro{margin:0 0 20px}
.aud .cards{display:grid;gap:14px}
.aud .c{background:#fff;border-radius:16px;padding:16px 18px;display:grid;grid-template-columns:auto 1fr;gap:4px 14px;page-break-inside:avoid;break-inside:avoid}
.aud .ic{grid-row:1/4;font-size:36px;line-height:1;display:grid;place-items:center;width:58px;height:58px;border-radius:14px}
.aud .q{font-weight:900}
.aud ul{margin:4px 0 0;padding-left:20px}
.aud .ex{margin-top:6px;border-radius:10px;padding:6px 10px;font-size:.92em}
.aud .help{margin-top:18px;border-radius:16px;padding:16px 18px;background:#fff}
.aud .org{font-size:.8em;opacity:.8;margin-top:14px}
.aud .say{float:right;border:0;border-radius:99px;padding:6px 14px;font:inherit;font-size:.75em;cursor:pointer;background:#111;color:#fff}
.aud.child{background:linear-gradient(160deg,#fff6d6,#ffe3ec 60%,#e3f2ff);font-size:18px}
.aud.child h2{font-size:30px;color:#c2410c}
.aud.child .c{border:3px dashed #fbbf24}
.aud.child .ic{background:#fff3c4}
.aud.child .ex{background:#fff8e1}
.aud.teen{background:linear-gradient(160deg,#eef2ff,#e0f7f4);font-size:17px}
.aud.teen h2{font-size:28px;color:#4338ca}
.aud.teen .c{border:1px solid #c7d2fe;box-shadow:0 4px 0 #c7d2fe}
.aud.teen .ic{background:#e0e7ff}
.aud.teen .ex{background:#ecfdf5;color:#065f46}
.aud.senior{background:#fffdf5;border:3px solid #1f2937;font-size:24px;line-height:1.7}
.aud.senior h2{font-size:36px;color:#111}
.aud.senior .c{border:2px solid #1f2937}
.aud.senior .ic{background:#fde68a;width:72px;height:72px;font-size:44px}
.aud.senior .q{font-size:1.1em;color:#7c2d12}
.aud.senior .ex{background:#f3f4f6;color:#111}
.aud.senior .help{border:3px solid #b91c1c;font-weight:700}
@media (max-width:760px){.aud{padding:16px}.aud.senior{font-size:21px}.aud .ic{width:48px;height:48px;font-size:28px}}
@media print{.aud .say{display:none}}`;
  const st = document.createElement('style'); st.textContent = AUD_CSS; document.head.appendChild(st);

  /* ---------- 핵심 사실 추출 (개선된 처리방침 → facts) ---------- */
  function facts() {
    const imp = S.improved || [];
    const by = (id) => (imp.find((x) => x.id === id) || {}).text || '';
    const has = (id) => imp.some((x) => x.id === id);
    const all = imp.map((x) => x.text).join('\n');
    let fields = window.RULES.dict.fields.filter((f) => all.includes(f.replace(/\(.*\)/, '')));
    if (fields.includes('이름')) fields = fields.filter((f) => f !== '성명');
    if (fields.includes('휴대전화번호')) fields = fields.filter((f) => f !== '전화번호');
    fields = fields.slice(0, 8);
    const purposes = [...by(2).matchAll(/(?:^|\n)\s*(?:\d+[.)]|•|-|[①-⑳])\s*([^:\n—]{2,24})/g)].map((m) => m[1].trim()).filter((s) => !/개인정보/.test(s)).slice(0, 5);
    if (!purposes.length) purposes.push(...(by(2).match(/([가-힣]{2,8}\s?(관리|처리|제공|안내|확인))/g) || []).slice(0, 4));
    const periods = [...new Set((by(5).match(/(\d+\s*(년|개월|일)|회원\s*탈퇴\s*시까지|탈퇴\s*시까지|목적\s*달성\s*시까지|동의\s*철회\s*시까지)/g) || []).map((s) => s.replace(/\s+/g, ' ')))].slice(0, 4);
    const dept = (by(18).match(/(?:담당\s*부서|부서명?)\s*[:：]?\s*([가-힣A-Za-z0-9]{2,15}(?:과|팀|실|센터|부|국|처))/) || [])[1] || '';
    const ai = imp.some((x) => x.id === 26);
    return {
      org: S.org, type: S.type, fields: fields.length ? fields : ['이름', '연락처'], purposes: purposes.length ? purposes : ['서비스 제공', '문의 답변'], periods: periods.length ? periods : ['필요한 기간 동안'],
      thirdParty: has(7), outsource: has(9) && !/위탁하지\s*않/.test(by(9)), abroad: has(10), cookie: has(14), child: has(4), cctv: has(21), ai, transfer: has(25),
      dept: dept || '개인정보 보호 담당부서', contact: '***'
    };
  }

  /* ---------- 대상별 템플릿 (토큰 0) ---------- */
  const list = (a, n = 6) => a.slice(0, n).join(', ');
  function template(aud, f) {
    const o = f.org;
    const T = {
      child: {
        title: `${o}의 개인정보 약속 🤝`,
        intro: `개인정보는 '나'를 알아볼 수 있는 정보예요. 이름, 얼굴 사진, 전화번호 같은 거예요. ${o}은(는) 여러분의 정보를 소중하게 지킬게요!`,
        cards: [
          { icon: '🙋', q: '어떤 정보를 받나요?', a: [`${list(f.fields, 5)}을(를) 받아요.`, '꼭 필요한 것만 받아요.'], ex: '예) 도서관 회원 카드를 만들 때 이름이 필요한 것과 같아요.' },
          { icon: '🎯', q: '왜 필요한가요?', a: [`${list(f.purposes, 3)}을(를) 하려고요.`, '말한 이유 말고 다른 데에는 쓰지 않아요.'], ex: '예) 상장을 보내려고 주소를 물어보는 것처럼요.' },
          { icon: '👨‍👩‍👧', q: '엄마·아빠가 함께 해요', a: ['14세가 안 된 친구는 보호자가 "좋아요"라고 해야 정보를 받을 수 있어요.', '보호자에게 먼저 꼭 물어봐요.'], ex: '예) 체험학습 신청서에 부모님 사인을 받는 것과 같아요.' },
          { icon: '⏰', q: '언제까지 가지고 있나요?', a: [`${list(f.periods, 3)}만 가지고 있어요.`, '다 쓰면 바로 지워요.'] },
          { icon: '🗑️', q: '어떻게 지우나요?', a: ['컴퓨터 속 정보는 다시 볼 수 없게 지워요.', '종이는 잘게 잘라서 버려요.'] },
          (f.thirdParty || f.outsource) && { icon: '🤝', q: '다른 곳에 주나요?', a: ['꼭 필요할 때만, 정해진 곳에만 맡겨요.', '맡긴 곳도 정보를 잘 지키는지 살펴봐요.'] },
          f.cookie && { icon: '🍪', q: '쿠키가 뭐예요?', a: ['홈페이지가 나를 기억하는 작은 메모예요.', '인터넷 설정에서 끌 수 있어요. 보호자와 함께 해 봐요.'] },
          f.ai && { icon: '🤖', q: '인공지능(AI)도 써요?', a: ['AI가 내가 쓴 말을 배우는 데 쓸 수 있어요.', '싫으면 "배우지 마!" 하고 끌 수 있어요.'] },
          { icon: '✋', q: '나도 말할 수 있어요!', a: ['"내 정보 보여 주세요", "고쳐 주세요", "지워 주세요"라고 할 수 있어요.', '보호자와 함께 연락하면 돼요.'] },
          { icon: '🛡️', q: '어떻게 지켜요?', a: ['정해진 사람만 볼 수 있게 잠가 둬요.', '정보를 암호로 바꿔서 지켜요.'] }
        ],
        help: `궁금하면 보호자와 함께 ${o} ${f.dept}(☎ ${f.contact})에 물어보세요. 속상한 일이 생기면 개인정보 침해 신고센터(☎ 118)에 도움을 받을 수 있어요.`,
        outro: '내 정보는 소중해요. 모르는 사람에게 함부로 알려 주지 않기로 약속해요! 🤙'
      },
      teen: {
        title: `${o} 개인정보 처리방침 — 청소년을 위한 핵심 정리`,
        intro: `개인정보 처리방침은 ${o}이(가) 내 정보를 어떻게 다루는지 알려 주는 '약속 문서'예요. 꼭 알아야 할 것만 뽑았어요.`,
        cards: [
          { icon: '📋', q: '수집하는 정보(수집 항목)', a: [`${list(f.fields)}`, '목적에 꼭 필요한 최소한만 수집해요(최소 수집 원칙).'], ex: '예) 앱 가입할 때 입력하는 이름·휴대폰 번호' },
          { icon: '🎯', q: '쓰는 이유(처리 목적)', a: [`${list(f.purposes, 4)}`, '목적이 바뀌면 다시 동의를 받아요.'] },
          { icon: '🔞', q: '만 14세 이상이라면', a: ['만 14세부터는 스스로 동의할 수 있어요.', '그래서 동의 버튼을 누르기 전에 내용을 꼭 읽어 보세요.'], ex: '예) "선택" 동의는 안 해도 가입할 수 있어요.' },
          { icon: '⏳', q: '보관 기간(보유 기간)', a: [`${list(f.periods, 3)}`, '기간이 끝나면 지체 없이 파기(완전 삭제)해요.'] },
          (f.thirdParty || f.outsource || f.abroad) && { icon: '🔗', q: '다른 곳으로 가는 정보', a: [f.thirdParty ? '제3자 제공: 법이나 동의가 있을 때만 다른 기관·회사에 줘요.' : '', f.outsource ? '위탁: 시스템 관리 같은 일을 전문업체에 맡겨요.' : '', f.abroad ? '국외 이전: 해외 서버로 옮겨질 수 있어요. 거부할 수도 있어요.' : ''].filter(Boolean) },
          f.cookie && { icon: '🍪', q: '쿠키(방문 기록)', a: ['로그인 유지, 맞춤 서비스에 쓰여요.', '브라우저 설정 > 개인정보 > 쿠키에서 차단할 수 있어요.'] },
          f.ai && { icon: '🤖', q: 'AI 학습', a: ['입력한 대화가 AI 학습에 쓰일 수 있어요.', '설정에서 학습 거부(옵트아웃)를 할 수 있어요.'] },
          { icon: '🛡️', q: '안전하게 지키는 방법', a: ['접근 권한 관리, 암호화, 보안 프로그램으로 보호해요.'] },
          { icon: '💪', q: '나의 권리', a: ['내 정보 열람·정정·삭제·처리정지를 요구할 수 있어요.', '동의를 철회할 수도 있어요. 가입할 때보다 어렵지 않아야 해요.'], ex: '예) "내 게시물 속 전화번호 지워 주세요"라고 요청하기' }
        ],
        help: `문의: ${o} ${f.dept}(☎ ${f.contact}). 피해를 입었다면 개인정보 침해 신고센터(☎ 118, privacy.kisa.or.kr), 개인정보 분쟁조정위원회(☎ 1833-6972)에 도움을 요청할 수 있어요.`,
        outro: 'SNS·게임·앱에 정보를 입력하기 전에 "왜 필요한지" 한 번 더 확인하는 습관! 👍'
      },
      senior: {
        title: `${o} 개인정보 안내 (어르신용)`,
        intro: `개인정보란 이름, 전화번호, 주소처럼 어르신을 알아볼 수 있는 정보입니다. ${o}은(는) 어르신의 정보를 꼭 필요한 만큼만 받고 안전하게 지킵니다.`,
        cards: [
          { icon: '📝', q: '어떤 정보를 받습니까?', a: [`${list(f.fields, 5)}`, '꼭 필요한 정보만 받습니다.'], ex: '예) 주민센터에서 신청서를 쓸 때와 같습니다.' },
          { icon: '🎯', q: '왜 받습니까?', a: [`${list(f.purposes, 3)}을(를) 위해서입니다.`, '다른 일에는 쓰지 않습니다.'] },
          { icon: '📅', q: '언제까지 보관합니까?', a: [`${list(f.periods, 3)} 보관합니다.`, '기간이 지나면 바로 없앱니다.'] },
          (f.thirdParty || f.outsource) && { icon: '🤝', q: '다른 곳에 넘깁니까?', a: ['법에서 정했거나 어르신이 허락하신 경우에만 넘깁니다.', '일을 맡긴 업체도 잘 지키는지 살핍니다.'] },
          f.cookie && { icon: '💻', q: '인터넷 방문 기록', a: ['홈페이지를 편하게 쓰시도록 방문 기록 파일(쿠키)을 씁니다.', '원하지 않으시면 자녀분께 "쿠키 차단"을 부탁하세요.'] },
          { icon: '🔒', q: '어떻게 지킵니까?', a: ['정해진 직원만 볼 수 있게 잠가 둡니다.', '중요한 정보는 암호로 바꾸어 보관합니다.'] },
          { icon: '🙋', q: '어르신이 요구하실 수 있는 것', a: ['내 정보를 보여 달라, 고쳐 달라, 지워 달라고 하실 수 있습니다.', '전화 한 통으로 신청하실 수 있습니다. 가족이 대신 신청할 수도 있습니다(위임장 필요).'] },
          { icon: '⚠️', q: '이런 전화는 조심하세요', a: [`${o}은(는) 전화나 문자로 통장 비밀번호를 묻지 않습니다.`, '의심되면 바로 끊고 아래 번호로 확인하세요.'], ex: '예) "개인정보가 유출됐으니 계좌번호를 알려 달라" → 사기입니다.' }
        ],
        help: `☎ 문의: ${o} ${f.dept} (전화 ${f.contact})\n☎ 개인정보 침해 신고: 118 (국번 없이)\n☎ 개인정보 분쟁조정: 1833-6972`,
        outro: '모르는 것은 언제든 전화로 편하게 물어보십시오.'
      }
    };
    const t = T[aud];
    t.cards = t.cards.filter(Boolean).filter((c) => c.a && c.a.length);
    if (aud === 'child' && !f.child) t.cards = t.cards.map((c) => (c.icon === '👨‍👩‍👧' ? { ...c, a: ['14세가 안 된 친구는 보호자의 동의가 꼭 필요해요.', '보호자에게 먼저 물어봐요.'] } : c));
    return t;
  }

  /* [개발보안 코드오류-5 신뢰할 수 없는 데이터] AI 응답을 정해진 형식·길이로만 받아들임 */
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  function clean(r) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.cards)) throw new Error('AI 응답 형식 오류');
    return {
      title: str(r.title, 80), intro: str(r.intro, 400), help: str(r.help, 400), outro: str(r.outro, 300),
      cards: r.cards.slice(0, 12).map((c) => ({ icon: str(c && c.icon, 4) || '•', q: str(c && c.q, 60), a: (Array.isArray(c && c.a) ? c.a : []).slice(0, 4).map((x) => str(x, 200)).filter(Boolean), ex: str(c && c.ex, 200) })).filter((c) => c.q)
    };
  }

  /* ---------- 화면 그리기 ---------- */
  function audHtml(aud, d, forReport) {
    const today = new Date().toLocaleDateString('ko-KR');
    return `<div class="aud ${aud}"${forReport ? '' : ' id="audDoc"'}>
      ${forReport ? '' : '<button class="say" type="button" data-html2canvas-ignore="true">🔊 읽어 주기</button>'}
      <h2>${esc(d.title)}</h2>
      <p class="intro">${esc(d.intro)}</p>
      <div class="cards">${(d.cards || []).map((c) => `<div class="c"><div class="ic" aria-hidden="true">${esc(c.icon)}</div><div class="q">${esc(c.q)}</div><ul>${(c.a || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${c.ex ? `<div class="ex">${esc(c.ex)}</div>` : '<div></div>'}</div>`).join('')}</div>
      <div class="help">📞 ${esc(d.help).replace(/\n/g, '<br>')}</div>
      <p>${esc(d.outro || '')}</p>
      <p class="org">${esc(S.org)} 개인정보 처리방침(${NAME[aud]}) · ${today} · 자세한 내용은 ${esc(S.org)} 개인정보 처리방침 전문을 확인하세요.</p>
    </div>`;
  }
  // 점검 보고서용: 화면에서 만든 결과(AI 포함)가 있으면 그것을, 없으면 템플릿(토큰 0)으로 작성
  S.audData = {};
  S.audienceHtml = (aud) => audHtml(aud, S.audData[aud] || template(aud, facts()), true);
  S.audienceData = (aud) => S.audData[aud] || template(aud, facts());
  S.audienceName = NAME;
  function render(aud, d) {
    S.audData[aud] = d;
    $('#audOut').innerHTML = audHtml(aud, d, false);
    $('#audOut .say').addEventListener('click', () => speak($('#audDoc').innerText.replace('🔊 읽어 주기', '')));
  }
  function speak(t) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, ''));
    u.lang = 'ko-KR'; u.rate = S.aud === 'senior' ? 0.85 : 0.95;
    speechSynthesis.speak(u);
  }

  async function generate(aud) {
    S.aud = aud;
    document.querySelectorAll('.aud-btn').forEach((b) => b.classList.toggle('on', b.dataset.aud === aud));
    $('#audBar').hidden = false;
    const f = facts();
    const useAI = $('#audAI').checked && S.health.ai;
    render(aud, template(aud, f));
    $('#audHint').textContent = useAI ? 'AI가 더 쉽게 다시 쓰는 중…' : '템플릿으로 생성했습니다(토큰 0).';
    if (!useAI) return;
    try {
      const d = await S.callAI('audience', { level: aud, facts: f }, C.AI.maxTokensAudience);
      if (S.aud !== aud) return;
      render(aud, clean(d.result));
      $('#audHint').textContent = d.cached ? 'AI 결과(캐시, 토큰 0)' : `AI 생성 완료 · 입력 ${d.usage?.input_tokens ?? '-'} / 출력 ${d.usage?.output_tokens ?? '-'} 토큰`;
    } catch (e) { console.warn('[계층별 AI]', e && e.message); $('#audHint').textContent = '⚠ AI 실패 — 템플릿 결과를 표시합니다. (' + String(e && e.message || '').slice(0, 120) + ')'; }
  }

  /* ---------- 이벤트 ---------- */
  document.querySelectorAll('.aud-btn').forEach((b) => b.addEventListener('click', () => generate(b.dataset.aud)));
  $('#audAI').addEventListener('change', () => S.aud && generate(S.aud));
  document.addEventListener('analyzed', () => {
    $('#audAI').closest('label').hidden = !S.health.ai;
    $('#audOut').innerHTML = '<p class="hint">위에서 대상을 고르면 개선된 처리방침을 바탕으로 쉬운 처리방침이 만들어집니다.</p>';
    $('#audBar').hidden = true; S.aud = null; S.audData = {};
    document.querySelectorAll('.aud-btn').forEach((b) => b.classList.remove('on'));
  });
  const fname = () => `${String(S.org).replace(/[\\/:*?"<>|\s]+/g, '_')}_개인정보처리방침_${NAME[S.aud]}`;
  $('#audPdf').addEventListener('click', () => S.toPdf($('#audDoc'), fname() + '.pdf'));
  $('#audHtml').addEventListener('click', () => {
    const body = $('#audDoc').outerHTML;
    S.download(fname() + '.html', `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(S.org)} 개인정보 처리방침(${NAME[S.aud]})</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet"><style>body{margin:0;padding:16px;background:#fff}.aud{max-width:860px;margin:auto}${AUD_CSS}</style></head><body>${body}<script>document.querySelector('.say').onclick=function(){var u=new SpeechSynthesisUtterance(document.querySelector('.aud').innerText);u.lang='ko-KR';speechSynthesis.cancel();speechSynthesis.speak(u)}<\/script></body></html>`);
  });
})();
