/* =====================================================================
 * 개인정보 처리방침 점검 에이전트 — 메인 로직
 *  1) 불러오기(Worker → 공개 프록시 → 붙여넣기)  2) 비식별(***)
 *  3) 규칙 기반 점검(토큰 0)  4) 대시보드  5) 보고서·PDF  6) 개선된 처리방침
 *  7) (선택) Claude API로 개선문구 다듬기 — 미흡 항목만 짧게 보내 토큰 최소화
 * ===================================================================== */
(function () {
  'use strict';
  const C = window.APP_CONFIG, R = window.RULES;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ST = {
    good: { label: '충족', cls: 'b-good', color: '#0ca30c', icon: '✔' },
    warn: { label: '일부 미흡', cls: 'b-warn', color: '#fab219', icon: '▲' },
    bad: { label: '누락', cls: 'b-bad', color: '#d03b3b', icon: '✖' },
    na: { label: '해당여부 확인', cls: 'b-na', color: '#8f8e87', icon: '?' }
  };
  const S = (window.APP = { health: {}, charts: {} });
  /* [개발보안 에러처리-3 부적절한 예외 처리] 예외를 무시하지 않고 기록 후 안전한 기본값으로 진행 */
  const warn = (where, e) => console.warn('[점검 에이전트] ' + where + ':', e && e.message ? e.message : e);
  /* [개발보안 입력데이터 검증-7 신뢰되지 않는 URL] http/https 주소만 허용 */
  const isHttpUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && u.length <= 2048; } catch (e) { return false; } };
  const WORKER = /^https:\/\//.test(C.WORKER_URL || '') ? C.WORKER_URL.replace(/\/$/, '') : '';
  const MAX_TEXT = 300000; // 처리할 최대 글자 수(자원 고갈 방지)
  const MAX_FILE = 2 * 1024 * 1024; // 업로드 최대 2MB

  /* ---------------- 초기화: Worker 상태·법령 확인 ---------------- */
  async function init() {
    $('#ruleVer').textContent = `· 점검 규칙 v${R.meta.version} (${R.meta.updated} 갱신)`;
    $('#refCount').textContent = `(${R.meta.refs.length}종)`; $('#refList').textContent = R.meta.refs.join(' · ');
    const chips = [];
    if (WORKER) {
      try {
        const h = await (await fetchWithTimeout(WORKER + '/health', 8000)).json();
        S.health = { fetch: h.fetch === true, ai: h.ai === true, law: h.law === true, mcp: h.mcp === true };
      } catch (e) { warn('Worker 상태 확인 실패', e); S.health = {}; }
    } else if (C.WORKER_URL) warn('설정', 'WORKER_URL은 https:// 로 시작해야 합니다.');
    chips.push(chip('페이지 불러오기 API', !!S.health.fetch));
    chips.push(chip('Claude AI', !!S.health.ai));
    chips.push(chip('법제처 API', !!S.health.law));
    chips.push(chip('MCP 서버', !!S.health.mcp));
    if (!S.health.ai) chips.push('<span class="chip on">토큰 0 모드</span>');
    $('#chips').innerHTML = chips.join('');
    if (S.health.law) loadLaw();
  }
  const chip = (t, on) => `<span class="chip ${on ? 'on' : 'off'}">${t}</span>`;

  async function loadLaw() {
    try {
      const d = await (await fetchWithTimeout(WORKER + '/law', 10000)).json();
      if (d && d.law && /^\d{8}$/.test(String(d.law.effective))) S.law = d;
    } catch (e) { warn('법령 정보 조회 실패', e); }
  }

  /* ---------------- 1) 불러오기 ---------------- */
  async function fetchWithTimeout(u, ms = 20000, opt = {}) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try { return await fetch(u, { ...opt, signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); } finally { clearTimeout(t); }
  }
  function decode(buf, ctype) {
    let cs = (ctype || '').match(/charset=([\w-]+)/i)?.[1];
    if (!cs) {
      const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
      cs = head.match(/charset=["']?([\w-]+)/i)?.[1];
    }
    cs = (cs || 'utf-8').toLowerCase();
    if (/ks_c_5601|ksc5601|cp949|x-windows-949/.test(cs)) cs = 'euc-kr';
    try { return new TextDecoder(cs).decode(buf); } catch (e) { warn('문자셋 ' + cs, e); return new TextDecoder('utf-8').decode(buf); }
  }
  async function getHtml(url) {
    const tries = [];
    if (!isHttpUrl(url)) throw new Error('http:// 또는 https:// 로 시작하는 올바른 주소를 입력해 주세요.');
    if (WORKER) tries.push(WORKER + '/fetch?url=' + encodeURIComponent(url));
    C.PUBLIC_PROXIES.forEach((p) => tries.push(p + encodeURIComponent(url)));
    let lastErr = '';
    for (const u of tries) {
      try {
        progress(`불러오는 중… (${new URL(u).host})`);
        const r = await fetchWithTimeout(u);
        if (!r.ok) { lastErr = 'HTTP ' + r.status; continue; }
        const buf = await r.arrayBuffer();
        if (buf.byteLength > 5000000) { lastErr = '문서가 너무 큼'; continue; }
        const html = decode(buf, r.headers.get('content-type'));
        if (html && html.length > 200) return html;
      } catch (e) { lastErr = e.name === 'AbortError' ? '시간 초과' : '연결 실패'; warn('불러오기', e); }
    }
    throw new Error('주소에서 내용을 불러오지 못했습니다(' + lastErr + '). 아래 “내용 직접 붙여넣기”를 이용해 주세요.');
  }
  const BLOCK = /^(P|DIV|SECTION|ARTICLE|H[1-6]|LI|UL|OL|TR|TABLE|BR|DT|DD|DL|PRE|BLOCKQUOTE|TBODY|THEAD|CAPTION|FIGURE|HR)$/;
  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    $$('script,style,noscript,svg,nav,header,form,button,select,template', doc).forEach((n) => n.remove());
    const root = doc.querySelector('#contents,#content,.privacy,.policy,main,article') || doc.body;
    let out = '';
    (function walk(n, depth) {
      if (depth > 200 || out.length > MAX_TEXT) return; // [개발보안 시간및상태-2] 재귀 깊이·크기 제한
      for (const c of n.childNodes) {
        if (c.nodeType === 3) out += c.nodeValue.replace(/\s+/g, ' ');
        else if (c.nodeType === 1) {
          const tag = c.tagName;
          if (BLOCK.test(tag)) out += '\n';
          if (tag === 'TD' || tag === 'TH') out += ' | ';
          walk(c, depth + 1);
          if (BLOCK.test(tag)) out += '\n';
        }
      }
    })(root || doc.body, 0);
    const text = out.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    const frame = doc.querySelector('iframe[src],frame[src]')?.getAttribute('src') || '';
    return { text, frame };
  }

  /* ---------------- 2)·3) 비식별·점검 — 공용 엔진(engine.js) 사용 ---------------- */
  const { mask, analyze } = window.PrivacyEngine;

  /* ---------------- 4) 대시보드 ---------------- */
  function renderDash() {
    const A = S.A;
    const k = (label, v, color, hero) => `<div class="kpi${hero ? ' hero' : ''}"><div class="k">${color ? `<i class="dot" style="background:${color}"></i>` : ''}${label}</div><div class="v">${v}</div></div>`;
    $('#kpis').innerHTML =
      k('종합 점수', `${A.score}<small>/100</small><span class="grade" style="background:${A.grade.c};color:${A.grade.f}">${A.grade.t}</span>`, '', true) +
      k('✔ 충족', A.count.good + '<small>개</small>', ST.good.color) +
      k('▲ 일부 미흡', A.count.warn + '<small>개</small>', ST.warn.color) +
      k('✖ 누락', A.count.bad + '<small>개</small>', ST.bad.color) +
      k('? 해당여부 확인', A.count.na + '<small>개</small>', ST.na.color);

    if (!window.Chart) { warn('차트', '라이브러리를 불러오지 못했습니다(파일로 열었거나 무결성 검사 실패).'); return; }
    Object.values(S.charts).forEach((c) => c.destroy());
    Chart.defaults.font.family = "'Noto Sans KR', sans-serif";
    Chart.defaults.color = '#52514e';
    const order = ['good', 'warn', 'bad', 'na'];
    S.charts.status = new Chart($('#cStatus'), {
      type: 'doughnut',
      data: { labels: order.map((s) => ST[s].label), datasets: [{ data: order.map((s) => A.count[s]), backgroundColor: order.map((s) => ST[s].color), borderColor: '#fcfcfb', borderWidth: 2 }] },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw}개` } } } }
    });
    $('#lgStatus').innerHTML = order.map((s) => `<span><i class="dot" style="background:${ST[s].color}"></i>${ST[s].icon} ${ST[s].label} ${A.count[s]}</span>`).join('');
    S.charts.radar = new Chart($('#cRadar'), {
      type: 'radar',
      data: { labels: A.groups.map((g) => g.name), datasets: [{ label: '충족률', data: A.groups.map((g) => g.v), borderColor: '#2a78d6', backgroundColor: 'rgba(42,120,214,.15)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#2a78d6' }] },
      options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent' }, grid: { color: '#e1e0d9' }, angleLines: { color: '#e1e0d9' }, pointLabels: { font: { size: 12, weight: '500' } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw}%` } } } }
    });
    const rs = A.all.filter((r) => r.status !== 'na');
    S.charts.bar = new Chart($('#cBar'), {
      type: 'bar',
      data: { labels: rs.map((r) => short(r)), datasets: [{ data: rs.map((r) => Math.round(r.score * 100)), backgroundColor: rs.map((r) => ST[r.status].color), borderRadius: 4, barThickness: 12 }] },
      plugins: [{ id: 'vlabel', afterDatasetsDraw(ch) { const { ctx } = ch; ctx.save(); ctx.font = '11px "Noto Sans KR", sans-serif'; ctx.fillStyle = '#52514e'; ctx.textBaseline = 'middle';
        ch.getDatasetMeta(0).data.forEach((bar, i) => { const v = ch.data.datasets[0].data[i]; const inside = v >= 92;
          ctx.fillStyle = inside ? '#ffffff' : '#52514e'; ctx.fillText(v + '%', inside ? bar.x - 34 : bar.x + 6, bar.y); }); ctx.restore(); } }],
      options: { indexAxis: 'y', maintainAspectRatio: false, layout: { padding: { right: 8 } }, scales: { x: { min: 0, max: 100, grid: { color: '#e1e0d9' }, ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => rs[c[0].dataIndex].title, label: (c) => ` ${c.raw}% · ${ST[rs[c.dataIndex].status].label} · ${rs[c.dataIndex].level}` } } } }
    });
    $('#cBar').parentElement.style.height = Math.max(260, rs.length * 24 + 40) + 'px';
    const law = S.law?.law;
    $('#lawBox').innerHTML = `<b>📚 법령 최신성</b><p class="hint" style="margin:6px 0 0">점검 규칙에 반영된 「개인정보 보호법」 시행일: <b>${R.meta.lawEffective}</b> (규칙 v${R.meta.version}).
      ${law ? ` 법제처 API로 확인한 현행 법률 시행일: <b>${esc(fmtDate(law.effective))}</b> ${String(law.effective).replace(/-/g, '') > R.meta.lawEffective.replace(/-/g, '') ? '<span class="badge b-warn">▲ 규칙보다 새 법령이 있습니다 — rules.js 갱신 필요</span>' : '<span class="badge b-good">✔ 최신 반영</span>'}` : ' (법제처 API 미연결: <a href="https://www.law.go.kr/법령/개인정보보호법" target="_blank" rel="noopener">국가법령정보센터에서 직접 확인</a>)'}
      · 기준 자료: ${R.meta.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>`).join(' · ')}</p>`;
  }
  const short = (r) => (r.global ? r.id + ' ' : r.id + '. ') + (r.title.length > 18 ? r.title.slice(0, 17) + '…' : r.title);
  const fmtDate = (d) => { d = String(d || ''); return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d; };

  /* ---------------- 5) 보고서 ---------------- */
  function lawLink(b) {
    const m = b.match(/^(개인정보 보호법(?: 시행령)?)\s*(제\d+조(?:의\d+)?)/);
    if (!m) return esc(b);
    const u = 'https://www.law.go.kr/법령/' + m[1].replace(/\s/g, '') + '/' + m[2];
    return `<a href="${encodeURI(u)}" target="_blank" rel="noopener">${esc(b)}</a>`;
  }
  const badge = (r) => `<span class="badge ${ST[r.status].cls}">${ST[r.status].icon} ${ST[r.status].label}</span>`;
  function renderReport() {
    if (S.improved) S.cmpRows = window.PrivacyEngine.comparisonRows(S.A, S.improved, S.org);
    const A = S.A, today = new Date().toLocaleDateString('ko-KR');
    const imgs = ['cStatus', 'cRadar'].map((id) => { try { return $('#' + id).toDataURL('image/png'); } catch (e) { warn('차트 이미지', e); return ''; } });
    const issues = A.all.filter((r) => r.status === 'warn' || r.status === 'bad');
    const okList = A.all.filter((r) => r.status === 'good');
    const naList = A.all.filter((r) => r.status === 'na');
    const card = (r) => `<section class="ritem">
      <header><b>${r.global ? '[형식·최신성] ' : r.id + '. '}${esc(r.title)}</b><span>${badge(r)} <span class="lv">${r.level}</span></span></header>
      <dl>
        <dt>기관명</dt><dd>${esc(S.org)}</dd>
        <dt>현행 내용</dt><dd class="quote">${esc(r.excerpt || '해당 항목을 찾을 수 없습니다.')}</dd>
        <dt>미흡한 부분</dt><dd><ul>${r.missing.map((m) => `<li>${esc(m.t)}</li>`).join('')}</ul></dd>
        <dt>개선 방법<br>(예시)</dt><dd class="ex"><ul>${r.missing.map((m) => `<li>${esc(m.fix)}</li>`).join('')}</ul>${r.example ? `<div style="margin-top:8px"><b>작성 예시</b>\n${esc(r.example)}</div>` : ''}${r.ai ? `<div class="ai"><b>✨ AI 맞춤 개선 문구</b>\n${esc(r.ai)}</div>` : ''}</dd>
        <dt>근거</dt><dd>${r.basis.map(lawLink).join('<br>')}${r.note ? `<br><span class="hint">※ ${esc(r.note)}</span>` : ''}${r.page ? `<br><span class="hint">${esc(r.page)}</span>` : ''}</dd>
      </dl></section>`;
    $('#report').innerHTML = `<div class="pdf-chunk report">
      <h2>개인정보 처리방침 적정성 점검 보고서</h2>
      <dl class="meta">
        <dt>기관명</dt><dd>${esc(S.org)} (${S.type === 'public' ? '공공기관' : A.industry ? '민간 · ' + esc(A.industry) : '민간'})</dd>
        <dt>점검 대상</dt><dd>${esc(S.url || '직접 입력한 내용')}</dd>
        <dt>점검일</dt><dd>${today}</dd>
        <dt>점검 기준</dt><dd>「개인정보 보호법」(${R.meta.lawEffective} 시행) 제30조, 같은 법 시행령 제31조, 「표준 개인정보 보호지침」 제18조·제11조 및 개인정보보호위원회 안내서 등 ${R.meta.refs.length}종<br><span class="hint">${R.meta.refs.map(esc).join(' · ')}</span></dd>
        <dt>종합 결과</dt><dd><b style="font-size:20px">${A.score}점</b> / 100 <span class="grade" style="background:${A.grade.c};color:${A.grade.f}">${A.grade.t}</span> — 충족 ${A.count.good} · 일부 미흡 ${A.count.warn} · 누락 ${A.count.bad} · 해당여부 확인 ${A.count.na}</dd>
        <dt>비식별</dt><dd>성명·전화번호·전자우편 등 개인정보는 *** 로 표시함</dd>
      </dl>
      <div class="rtoc"><b>보고서 구성</b>
        <ol><li>점검 결과 (종합·항목별 결과·충족·해당 여부 확인)</li><li>개선 방법 및 근거 (미흡·누락 ${issues.length}건)</li><li>개선 후 개인정보 처리방침(안) (라벨링·목차 포함)</li><li>신구대조표 (현행 · 개정안 · 비고)</li><li>어린이 · 청소년 · 어르신별 개인정보 처리방침(안)</li><li>생성형 AI 서비스 개인정보 처리방침(안)</li></ol></div>
      <h3>1. 점검 결과</h3>
      <h4>1-1. 종합 결과</h4>
      <p><b style="font-size:18px">${A.score}점</b> / 100 <span class="grade" style="background:${A.grade.c};color:${A.grade.f}">${A.grade.t}</span> — 충족 ${A.count.good} · 일부 미흡 ${A.count.warn} · 누락 ${A.count.bad} · 해당여부 확인 ${A.count.na}</p>
      <div class="rcharts" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">${imgs.filter(Boolean).map((s) => `<img src="${s}" style="width:300px;max-width:100%;height:auto">`).join('')}</div>
      <h4>1-2. 항목별 점검 결과</h4>
      <table class="sumtbl"><thead><tr><th>번호</th><th>점검 항목</th><th>구분</th><th>결과</th></tr></thead><tbody>
      ${A.all.map((r) => `<tr><td>${r.id}</td><td>${esc(r.title)}</td><td>${r.level}</td><td>${badge(r)}</td></tr>`).join('')}
      </tbody></table>
      <h4>1-3. 충족 항목 (${okList.length}건)</h4>
      <p>${okList.map((r) => esc((r.global ? r.id : r.id + '.') + ' ' + r.title) + (r.note ? ` <span class="hint">(${esc(r.note)})</span>` : '')).join(' · ') || '없음'}</p>
      <h4>1-4. 해당 여부 확인이 필요한 항목 (${naList.length}건)</h4>
      <p class="hint">처리방침에서 관련 내용을 찾지 못한 '해당시' 항목입니다. 실제로 해당 처리를 한다면 항목을 추가하고, 하지 않는다면 “처리하지 않습니다”라고 적는 것을 권장합니다.</p>
      <p>${naList.map((r) => esc(r.id + ' ' + r.title)).join(' · ') || '없음'}</p>
      </div><div class="pdf-chunk report"><h3>2. 개선 방법 및 근거 (${issues.length}건)</h3>
      <p class="hint">항목마다 현행 내용, 미흡한 부분, 개선 방법(작성 예시), 근거 조문을 정리했습니다.</p>
      ${issues.length ? issues.map(card).join('') : '<p>미흡한 항목이 없습니다.</p>'}
      </div><div class="pdf-chunk report"><h3>3. 개선 후 개인정보 처리방침(안)</h3>
      <p class="hint">점검 결과를 자동으로 반영한 초안입니다. <span class="tag">보완</span>은 현행 내용에 문구를 더한 조항, <span class="tag">신설</span>은 새로 넣은 조항입니다. <mark>○○</mark> 부분은 기관의 실제 처리 현황으로 채운 뒤 개인정보 보호책임자의 검토를 거쳐 게시하세요.</p>
      <div class="doc embed">${S.improved ? improvedHtml(S.improved, 'r') : ''}</div>
      </div><div class="pdf-chunk report"><h3>4. 신구대조표 (현행 · 개정안 · 비고)</h3>
      <p class="hint">현행 처리방침과 개정안을 조항별로 비교한 표입니다. <b style="color:#1d4ed8">파란 글씨</b>는 새로 넣거나 보완한 부분이며, 비고에 개정 사유를 적었습니다.</p>
      ${S.cmpRows ? compareHtml(S.cmpRows) : ''}
      </div><div class="pdf-chunk report"><h3>5. 어린이 · 청소년 · 어르신별 개인정보 처리방침(안)</h3>
      <p class="hint">개선 후 개인정보 처리방침(안)을 바탕으로 대상별 눈높이에 맞춰 핵심만 쉽게 정리했습니다. 홈페이지에는 ‘계층별 처리방침’ 탭의 HTML 파일로 게시할 수 있습니다.</p>
      ${S.audienceHtml ? ['child', 'teen', 'senior'].map((k, i) => `${i ? '</div><div class="pdf-chunk report">' : ''}<h4>5-${i + 1}. ${S.audienceName[k]} 개인정보 처리방침(안)</h4>${S.audienceHtml(k)}`).join('') : ''}
      </div><div class="pdf-chunk report"><h3>6. 생성형 AI 서비스 개인정보 처리방침(안)</h3>
      <p class="hint">생성형 AI(챗봇·AI 비서 등)를 운영하거나 외부 AI(API)를 연동하는 경우 본 처리방침의 부록으로 함께 공개합니다. 작성지침(2026.4.) 부록1, 「생성형 AI 개발·활용을 위한 개인정보 처리 안내서」(2025.8.), 「공공 AX 프라이버시 보호 안내서」(2026.7.)를 바탕으로 한 예시입니다.</p>
      <div class="doc embed">${S.aiPolicy ? improvedHtml(S.aiPolicy, 'ra') : ''}</div>
      <p class="hint" style="margin-top:20px">※ 본 보고서는 규칙 기반 자동 점검 결과이며 법률 자문이 아닙니다. 실제 처리 현황과 처리방침의 일치 여부는 기관이 직접 확인해야 합니다. 법령 원문: 국가법령정보센터(www.law.go.kr) / 지침: 개인정보보호위원회(www.pipc.go.kr) / 개인정보 침해신고: KISA(privacy.kisa.or.kr)</p></div>`;
  }

  /* ---------------- 6) 개선된 처리방침 ---------------- */
  /* 개선된 처리방침(안) HTML: 제목·서문 → 주요 개인정보 처리 표시(라벨링) → 목차(조항 이동) → 본문 */
  function improvedHtml(out, pre, opt) {
    pre = pre || 'p'; opt = opt || {};
    const sec = out.slice(1);
    const num = {}; sec.forEach((s, i) => { num[s.id] = i + 1; });
    const labels = window.PrivacyEngine.policyLabels(out);
    const icons = window.PrivacyEngine.articleIcons(out);
    const LI = window.LABEL_IMG || {};
    // 작성지침 공식 라벨 기호(이미지)가 있으면 이미지로, 없으면 같은 모양의 기호로 표시
    const sym = (x, size) => LI[x.img] ? `<img class="lb-img ${size}" src="${LI[x.img]}" alt="${esc(x.name)}" title="${esc(x.name)}">` : `<span class="lb-ic ${x.kind} ${size}" title="${esc(x.name)}" aria-label="${esc(x.name)}">${x.icon}</span>`;
    const ico = (id, size) => (icons[id] || []).map((x) => sym(x, size)).join('');
    const KIND = { type: '개인정보 유형', step: '처리 단계', right: '보호 의무·권리' };
    const lab = (l) => { const n = num[l.to]; const inner = `${LI[l.img] ? `<img class="lb-img lg" src="${LI[l.img]}" alt="">` : `<span class="lb-ic ${l.kind}" aria-hidden="true">${l.icon}</span>`}<span class="lb-nm">${esc(l.name)}</span><span class="lb-v">${esc(l.value)}</span>`;
      return n ? `<a class="lb" href="#${pre}-a${n}" title="${esc(l.name)} — 제${n}조로 이동">${inner}</a>` : `<span class="lb">${inner}</span>`; };
    return `<h2>${esc(out[0].title)}</h2><p>${esc(out[0].text)}</p>
      <section class="labels" aria-label="주요 개인정보 처리 표시">
        <h3>주요 개인정보 처리 표시(라벨링)</h3>
        ${['type', 'step', 'right'].map((k) => { const g = labels.filter((l) => l.kind === k); return g.length ? `<div class="lb-g"><div class="lb-k">${KIND[k]}</div><div class="lb-row">${g.map(lab).join('')}</div></div>` : ''; }).join('')}
        <p class="lb-note">※ 위 라벨은 개인정보 처리방침의 주요 내용을 요약한 것입니다. 라벨을 누르면 해당 조항으로 이동하며, 자세한 내용은 아래 본문에서 확인하실 수 있습니다.</p>
      </section>
      <nav class="toc" aria-label="목차"><h3>목차</h3><ol>${sec.map((s, i) => `<li><a href="#${pre}-a${i + 1}">${ico(s.id, 'xs')}제${i + 1}조 ${esc(s.title)}</a></li>`).join('')}</ol></nav>
      ${sec.map((s, i) => `<h3 id="${pre}-a${i + 1}" class="art-h">${ico(s.id, 'sm')}<span>제${i + 1}조(${esc(s.title)})</span>${s.tag ? `<span class="tag">${s.tag}</span>` : ''}</h3><p>${esc(s.text).replace(/○○/g, '<mark>○○</mark>')}</p>${tablesHtml(s, i + 1, opt)}`).join('')}`;
  }
  /* 조항 표: 예시 행(회색·‘예시’ 표시)을 제안하고, 화면에서 칸 수정·행 추가·삭제 가능 */
  function tablesHtml(s, k, opt) {
    if (!s.tables || !s.tables.length) return '';
    const ed = !!opt.editable, m = opt.model || '';
    return s.tables.map((t, ti) => `<div class="ptbl"><div class="ptbl-cap">${esc(t.caption)}</div>
      <table class="pt"><thead><tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}${ed ? '<th class="ptbl-x" data-html2canvas-ignore="true"></th>' : ''}</tr></thead>
      <tbody>${t.rows.map((r, ri) => `<tr class="${r.ex ? 'ex' : ''}">${r.cells.map((c, ci) => `<td${ed ? ` contenteditable="true" data-m="${m}" data-k="${k}" data-t="${ti}" data-r="${ri}" data-c="${ci}"` : ''}>${ci === 0 && r.ex ? '<span class="exb">예시</span> ' : ''}${esc(c).replace(/○○/g, '<mark>○○</mark>')}</td>`).join('')}${ed ? `<td class="ptbl-x" data-html2canvas-ignore="true"><button type="button" class="rowdel" data-m="${m}" data-k="${k}" data-t="${ti}" data-r="${ri}" title="행 삭제">✕</button></td>` : ''}</tr>`).join('')}</tbody></table>
      ${ed ? `<div class="ptbl-tools" data-html2canvas-ignore="true"><button type="button" class="btn rowadd" data-m="${m}" data-k="${k}" data-t="${ti}">+ 행 추가</button> <span class="hint">회색 ‘예시’ 행은 작성지침 예시입니다. 칸을 눌러 기관의 실제 내용으로 고치면 예시 표시가 사라집니다.</span></div>` : ''}</div>`).join('');
  }
  const TBL_CSS = `.ptbl{margin:8px 0 14px;break-inside:auto}.ptbl-cap{font-weight:700;font-size:13px;margin:4px 0}
.pt{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:auto}.pt th{background:#e8ecf4;border:1px solid #6b7280;padding:6px;text-align:center}
.pt td{border:1px solid #9aa1ab;padding:6px;vertical-align:top;white-space:pre-wrap}.pt tr.ex td{color:#6b6b6b;background:#fafafa;font-style:italic}
.pt td[contenteditable]:focus{outline:2px solid #1d4ed8;background:#fff}.exb{font-style:normal;font-size:10.5px;font-weight:700;color:#7a5200;background:#fff4d6;border-radius:4px;padding:0 5px}
.ptbl-x{width:28px;border:0!important;background:none!important}.rowdel{border:0;background:none;color:#b91c1c;cursor:pointer;font-size:14px}
.ptbl-tools{margin-top:6px}.ptbl-tools .btn{padding:4px 10px;font-size:13px}
.aip-note{border-left:4px solid #1d4ed8;background:#f4f8ff;padding:8px 12px;margin:10px 0;font-size:13px}`;
  { const st = document.createElement('style'); st.textContent = TBL_CSS; document.head.appendChild(st); }
  const LABEL_CSS = `.labels{border:2px solid #1d4ed8;border-radius:12px;padding:12px 14px;margin:14px 0;background:#f8faff}
.labels h3,.toc h3{margin:0 0 8px;font-size:16px}
.lb-g{margin:6px 0}.lb-k{font-size:12px;font-weight:700;color:#475569;margin-bottom:4px}
.lb-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.lb{display:grid;grid-template-columns:auto 1fr;gap:0 8px;align-items:center;padding:6px 8px;border:1px solid #d9dce3;border-radius:10px;background:#fff;color:inherit;text-decoration:none;break-inside:avoid}
a.lb:hover{border-color:#1d4ed8}
.lb-ic{grid-row:1/3;display:grid;place-items:center;width:38px;height:38px;font-size:20px;border:2px solid}
.lb-ic.type{border-radius:50%;border-color:#2a78d6;background:#eaf2fd}
.lb-ic.step{border-radius:8px;border-color:#0ca30c;background:#e8f7e8}
.lb-ic.right{border-radius:50% 50% 10px 10px;border-color:#c2410c;background:#fdf0e8}
.lb-img{display:inline-block;vertical-align:middle;object-fit:contain}.lb-img.lg{grid-row:1/3;width:46px;height:46px}.lb-img.sm{width:34px;height:34px;margin-right:4px}.lb-img.xs{width:22px;height:22px;margin-right:4px}
.lb-ic.sm{display:inline-grid;width:30px;height:30px;font-size:16px;margin-right:4px;vertical-align:middle;border-width:2px}
.lb-ic.xs{display:inline-grid;width:20px;height:20px;font-size:11px;margin-right:4px;vertical-align:middle;border-width:1.5px}
.art-h{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
.lb-nm{font-weight:700;font-size:13px}.lb-v{font-size:12px;color:#52514e}
.lb-note{font-size:12px;color:#52514e;margin:8px 0 0}
.toc{border:1px solid #d9dce3;border-radius:10px;padding:10px 14px;margin:12px 0;background:#fff}
.toc ol{margin:0;padding-left:0;list-style:none;columns:2;column-gap:20px}.toc li{margin:2px 0;break-inside:avoid}
.toc a{color:#1d4ed8;text-decoration:none}.toc a:hover{text-decoration:underline}
@media (max-width:640px){.toc ol{columns:1}}`;
  { const st = document.createElement('style'); st.textContent = LABEL_CSS; document.head.appendChild(st); }
  /* 신구대조표 HTML (현행 · 개정안 · 비고) */
  function policyDate(t) {
    const m = String(t || '').match(/(\d{4})\s*[.년-]\s*(\d{1,2})\s*[.월-]\s*(\d{1,2})\s*\.?\s*일?\s*부터\s*(시행|적용)/);
    return m ? `${m[1]}. ${+m[2]}. ${+m[3]}.` : '';
  }
  function compareHtml(rows, limit) {
    const today = new Date(); const td = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}.`;
    const cd = policyDate(S.masked);
    const paras = (t, cls) => String(t || '').slice(0, limit || 1e9).split('\n').filter((x) => x.trim()).map((x) => `<div class="cp${cls ? ' ' + cls : ''}">${esc(x)}</div>`).join('') + (limit && String(t || '').length > limit ? '<div class="cp more">… (전문은 ‘신구대조표’ 탭의 PDF 참조)</div>' : '');
    const neuCell = (r) => {
      if (r.kind === '신설') return paras(r.neu, 'add');
      if (r.add && r.add !== r.neu) { const base = r.neu.slice(0, r.neu.length - r.add.length); return paras(base) + paras(r.add.replace('[보완 문구]', '[보완]'), 'add'); }
      return paras(r.neu, r.kind === '보완' && !r.add ? 'add' : '');
    };
    return `<table class="cmp"><colgroup><col style="width:43%"><col style="width:43%"><col style="width:14%"></colgroup>
      <thead><tr><th>${esc(S.org)} 개인정보 처리방침 현행${cd ? `(${cd})` : ''}</th><th>${esc(S.org)} 개인정보 처리방침 개정안(${td})</th><th>비고</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="cmp-h"><td colspan="3">${esc(r.title)}${r.kind ? ` <span class="tag">${r.kind}</span>` : ''}</td></tr>
        <tr class="cmp-r"><td>${paras(r.cur, r.kind && r.cur.startsWith('(') ? 'none' : '')}</td><td>${neuCell(r)}</td><td class="why">${esc(r.reason || '')}</td></tr>`).join('')}</tbody></table>`;
  }
  const CMP_CSS = `.cmp{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;background:#fff}
.cmp th{background:#eef0f5;border:1px solid #9aa1ab;padding:7px 6px;font-size:13px;text-align:center}
.cmp td{border:1px solid #c3c2b7;padding:6px 7px;vertical-align:top;word-break:keep-all;overflow-wrap:anywhere}
.cmp .cmp-h td{background:#f7f7f4;font-weight:700;font-size:13px}
.cmp .cp{margin:0 0 2px;line-height:1.55}.cmp .cp.add{color:#1d4ed8;font-weight:500}.cmp .cp.none{color:#8a8984}.cmp .cp.more{color:#8a8984;font-style:italic}
.cmp .why{color:#1d4ed8;font-size:11.5px;text-align:left}
.cmp .tag{font-size:11px;font-weight:700;color:#7a5200;background:#fff4d6;border-radius:4px;padding:1px 6px}
.cmp-title{text-align:center;font-size:20px;margin:0 0 10px}`;
  { const st = document.createElement('style'); st.textContent = CMP_CSS; document.head.appendChild(st); }
  function buildCompare() {
    S.cmpRows = window.PrivacyEngine.comparisonRows(S.A, S.improved, S.org);
    $('#compare').innerHTML = `<h2 class="cmp-title">${esc(S.org)} 개인정보 처리방침 신구대조표</h2>` + compareHtml(S.cmpRows);
  }
  function renderImprovedTab() {
    $('#improved').innerHTML = improvedHtml(S.improved, 'p', { editable: true, model: 'main' }) +
      `<div class="aip" style="margin-top:28px;border-top:3px double #9aa1ab;padding-top:16px">
        <p class="aip-note">📎 <b>부록: 생성형 AI 서비스 개인정보 처리방침(안)</b> — 생성형 AI(챗봇·AI 비서 등)를 운영하거나 외부 AI(API)를 연동하는 경우 함께 공개합니다. 작성지침(2026.4.) 부록1과 「생성형 AI 개발·활용을 위한 개인정보 처리 안내서」(2025.8.)를 바탕으로 한 예시이며, 실제 서비스에 맞게 고쳐 쓰세요.</p>
        ${improvedHtml(S.aiPolicy, 'ai', { editable: true, model: 'ai' })}</div>`;
  }
  function buildImproved() {
    S.improved = window.PrivacyEngine.improvedPolicy(S.A, S.org);
    S.aiPolicy = window.PrivacyEngine.aiPolicy(S.org);
    renderImprovedTab();
    buildCompare();
  }
  // 표 편집 → 모델에 반영(보고서·내려받기 파일에도 그대로 들어감)
  const modelOf = (m) => (m === 'ai' ? S.aiPolicy : S.improved);
  $('#improved').addEventListener('input', (e) => {
    const td = e.target.closest('td[data-k]'); if (!td) return;
    const sec = modelOf(td.dataset.m)[+td.dataset.k]; const row = sec.tables[+td.dataset.t].rows[+td.dataset.r];
    row.cells[+td.dataset.c] = td.innerText.replace(/^예시\s*/, '').trim(); row.ex = false;
    td.closest('tr').classList.remove('ex'); const b = td.closest('tr').querySelector('.exb'); if (b) b.remove();
  });
  $('#improved').addEventListener('click', (e) => {
    const b = e.target.closest('.rowadd, .rowdel'); if (!b) return;
    const sec = modelOf(b.dataset.m)[+b.dataset.k]; const t = sec.tables[+b.dataset.t];
    if (b.classList.contains('rowadd')) t.rows.push({ cells: t.cols.map(() => ''), ex: false });
    else t.rows.splice(+b.dataset.r, 1);
    const y = window.scrollY; renderImprovedTab(); window.scrollTo(0, y);
  });

  /* ---------------- 7) Claude API (선택, 토큰 최소화) ---------------- */
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  async function callAI(task, payload, maxTokens) {
    const body = JSON.stringify({ task, model: C.AI.model, max_tokens: maxTokens, payload });
    const key = 'ai:' + hash(body);
    if (!WORKER) throw new Error('AI 기능이 설정되지 않았습니다.');
    try { const c = localStorage.getItem(key); if (c) return { ...JSON.parse(c), cached: true }; } catch (e) { warn('캐시 읽기', e); }
    const r = await fetchWithTimeout(WORKER + '/ai', 60000, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    let d;
    try { d = await r.json(); } catch (e) { throw new Error('AI 응답 형식 오류'); }
    if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error.slice(0, 200) : 'AI 오류');
    if (!d || typeof d.result !== 'object') throw new Error('AI 응답 형식 오류');
    try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { warn('캐시 저장', e); }
    return { ...d, cached: r.headers.get('X-Cache') === 'HIT' };
  }
  S.callAI = callAI;
  async function aiFix() {
    const btn = $('#aiFixBtn'); btn.disabled = true; $('#aiFixHint').textContent = 'AI가 미흡 항목만 다듬는 중…';
    try {
      const items = S.A.all.filter((r) => r.status === 'warn' || r.status === 'bad').map((r) => ({
        id: r.id, title: r.title, missing: r.missing.map((m) => m.t), excerpt: (r.excerpt || '').slice(0, C.AI.excerptChars), basis: r.basis.slice(0, 2)
      }));
      const d = await callAI('fix', { org: S.org, type: S.type, items }, C.AI.maxTokensFix + items.length * 120);
      // [개발보안 코드오류-5 신뢰할 수 없는 데이터] AI 응답은 형식·길이 검증 후 비식별·이스케이프하여 사용
      (Array.isArray(d.result.items) ? d.result.items : []).forEach((x) => {
        if (!x || typeof x.text !== 'string') return;
        const r = S.A.all.find((y) => String(y.id) === String(x.id)); if (r) r.ai = mask(x.text.slice(0, 1500));
      });
      buildImproved(); renderReport();
      $('#aiFixHint').textContent = d.cached ? '캐시된 결과를 사용했습니다(토큰 0).' : `완료 · 입력 ${d.usage?.input_tokens ?? '-'} / 출력 ${d.usage?.output_tokens ?? '-'} 토큰`;
    } catch (e) { $('#aiFixHint').textContent = '⚠ ' + e.message; }
    btn.disabled = false;
  }

  /* ---------------- PDF ---------------- */
  async function toPdf(el, name, orientation) {
    orientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    // 화면 위치·스크롤과 무관하게 A4 폭(794px)의 복제본을 만들어 PDF로 변환
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:0;top:0;width:${orientation === 'landscape' ? 1123 : 794}px;background:#fff;z-index:-1`;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-html2canvas-ignore]').forEach((n) => n.remove());
    box.appendChild(clone); document.body.appendChild(box);
    const y = window.scrollY; window.scrollTo(0, 0);
    document.body.classList.add('pdf-mode');
    try {
      const opt = {
        margin: [10, 8, 12, 8], filename: name, image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 1.6, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.ritem', '.c', 'tr:not(.cmp-r)', 'h3', 'h4', 'img', '.rcharts', '.rtoc', '.meta', '.help', '.cp', '.lb'] }
      };
      // 긴 문서는 장(.pdf-chunk) 단위로 나눠 그려 브라우저 캔버스 크기 한도(빈 페이지 문제)를 피함
      const parts = [...clone.querySelectorAll(':scope > .pdf-chunk')];
      if (!parts.length) parts.push(clone);
      let w = html2pdf().set(opt).from(parts[0]).toPdf();
      parts.slice(1).forEach((el) => { w = w.get('pdf').then((pdf) => { pdf.addPage(); }).from(el).toContainer().toCanvas().toPdf(); });
      await w.save();
    } catch (e) { warn('PDF 생성', e); alert('PDF 생성 중 오류가 발생했습니다. 브라우저 인쇄(Ctrl+P) → PDF로 저장을 이용해 주세요.'); }
    finally { document.body.classList.remove('pdf-mode'); box.remove(); window.scrollTo(0, y); }
  }
  S.toPdf = toPdf;
  S.download = (name, content, type = 'text/html') => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const safe = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, '_');

  /* ---------------- 실행 ---------------- */
  function progress(t) { $('#progress').hidden = !t; $('#progressText').textContent = t || ''; }
  function error(msg) { let e = $('#form .err'); if (!e) { e = document.createElement('div'); e.className = 'err'; $('#form').appendChild(e); } e.textContent = msg; e.hidden = !msg; }

  async function run(textOverride) {
    error('');
    S.org = $('#org').value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 60); S.url = $('#url').value.trim(); S.type = ['public', 'travel', 'senior', 'realty'].includes($('#orgType').value) ? $('#orgType').value : 'private';
    if (!S.org) { error('기관명을 입력해 주세요.'); return; }
    if (S.url && !isHttpUrl(S.url)) { error('주소는 http:// 또는 https:// 로 시작해야 합니다.'); return; }
    $('#runBtn').disabled = true;
    try {
      let text = textOverride || $('#paste').value.trim();
      const f = $('#file').files[0];
      if (!text && f) {
        // [개발보안 입력데이터 검증-6 위험한 형식 파일 업로드] 확장자·크기 검사, 텍스트로만 읽고 실행하지 않음
        if (!/\.(html?|txt)$/i.test(f.name)) throw new Error('html, htm, txt 파일만 올릴 수 있습니다.');
        if (f.size > MAX_FILE) throw new Error('파일은 2MB 이하만 올릴 수 있습니다.');
        const raw = await f.text(); text = /<html|<body|<div/i.test(raw) ? htmlToText(raw).text : raw;
      }
      if (!text) {
        if (!S.url) throw new Error('처리방침 주소를 입력하거나, 내용을 붙여넣어 주세요.');
        const html = await getHtml(S.url);
        let { text: t, frame } = htmlToText(html);
        if (t.length < 1500 && frame) {
          try { const fu = new URL(frame, S.url).href; if (isHttpUrl(fu)) t = htmlToText(await getHtml(fu)).text; } catch (e) { warn('프레임 불러오기', e); }
        }
        text = t;
      } else if (/<html|<body|<div/i.test(text)) text = htmlToText(text).text;
      text = text.slice(0, MAX_TEXT);
      if (text.length < 300) throw new Error('불러온 내용이 너무 짧습니다. 처리방침 본문을 직접 붙여넣어 주세요.');
      progress('개인정보 비식별(***) 처리 중…');
      S.masked = mask(text);
      progress('법령·작성지침 기준으로 점검 중…');
      S.A = analyze(S.masked, S.org, S.type);
      $('#raw').textContent = S.masked;
      $('#result').hidden = false; showTab('dash');
      renderDash();
      await new Promise((r) => setTimeout(r, 900));
      buildImproved(); renderReport();
      $('#aiFixBtn').hidden = !S.health.ai;
      document.dispatchEvent(new CustomEvent('analyzed'));
      $('#result').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { warn('점검', e); error(e instanceof Error && e.message ? e.message : '점검 중 오류가 발생했습니다.'); }
    progress(''); $('#runBtn').disabled = false;
  }
  function showTab(t) {
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== t));
  }

  /* 이벤트 */
  $('#form').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $('#demoBtn').addEventListener('click', () => { $('#org').value = '가나다시'; $('#orgType').value = 'public'; $('#url').value = ''; run(window.DEMO_POLICY); });
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#pdfBtn').addEventListener('click', () => { renderReport(); toPdf($('#report'), `${safe(S.org)}_개인정보처리방침_점검보고서.pdf`); });
  $('#aiFixBtn').addEventListener('click', aiFix);
  $('#hwpxBtn').addEventListener('click', () => S.exportReport('hwpx'));
  $('#docxBtn').addEventListener('click', () => S.exportReport('docx'));
  $('#impPdf').addEventListener('click', () => toPdf($('#improved'), `${safe(S.org)}_개선된_개인정보처리방침.pdf`));
  $('#impHtml').addEventListener('click', () => S.download(`${safe(S.org)}_개선된_개인정보처리방침.html`, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(S.org)} 개인정보 처리방침</title><style>body{font-family:'Noto Sans KR',sans-serif;max-width:860px;margin:auto;padding:24px;line-height:1.7}p{white-space:pre-wrap}.tag{font-size:11px;background:#fff4d6;padding:1px 6px;border-radius:4px;margin-left:6px}mark{background:#fff4d6}${LABEL_CSS}</style></head><body>${$('#improved').innerHTML}</body></html>`));
  $('#cmpPdf').addEventListener('click', () => toPdf($('#compare'), `${safe(S.org)}_개인정보처리방침_신구대조표.pdf`, 'landscape'));
  $('#cmpHtml').addEventListener('click', () => S.download(`${safe(S.org)}_개인정보처리방침_신구대조표.html`, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(S.org)} 개인정보 처리방침 신구대조표</title><style>body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;margin:16px}@page{size:A4 landscape;margin:10mm}${CMP_CSS}</style></head><body>${$('#compare').innerHTML}</body></html>`));
  $('#impCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#improved').innerText); $('#impCopy').textContent = '복사됨 ✔'; } catch (e) { warn('복사', e); $('#impCopy').textContent = '복사 실패(직접 선택해 복사)'; } });

  /* 체험용 예시(가상의 기관, 실제 정보 아님) */
  window.DEMO_POLICY = `가나다시 개인정보취급방침
가나다시는 이용자의 개인정보를 소중히 다루며 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 제27조의2에 따라 다음과 같이 개인정보취급방침을 공개합니다.
목차
1. 개인정보의 처리 목적 2. 처리하는 개인정보 항목 3. 개인정보의 처리 및 보유기간 4. 개인정보의 파기 5. 개인정보 처리업무의 위탁 6. 정보주체의 권리 7. 개인정보 보호책임자
제1조(개인정보의 처리 목적)
가나다시는 민원 처리, 홈페이지 회원 관리 등의 목적으로 개인정보를 처리합니다.
제2조(처리하는 개인정보 항목)
성명, 연락처, 주소 등
제3조(개인정보의 처리 및 보유기간)
관련 법령에 따라 보유합니다.
제4조(개인정보의 파기)
가나다시는 보유기간이 지난 개인정보를 지체 없이 파기합니다. 전자적 파일은 복구할 수 없도록 삭제하고, 종이 문서는 분쇄합니다.
제5조(개인정보 처리업무의 위탁)
가나다시는 홈페이지 유지보수 업무를 (주)가나시스템에 위탁하고 있습니다.
제6조(정보주체와 법정대리인의 권리·의무 및 행사방법)
정보주체는 개인정보 열람, 정정·삭제, 처리정지 요구를 할 수 있으며, 서면 또는 전자우편으로 요청할 수 있습니다.
제7조(개인정보 보호책임자)
개인정보 보호책임자 : 홍길동 (정보통신과장), 전화 031-123-4567, 이메일 hong@ganada.go.kr
개인정보 보호 담당부서 : 정보통신과, 담당자 : 김철수 주무관, 전화 031-123-4568
제8조(개인정보의 안전성 확보조치)
가나다시는 내부관리계획 수립, 개인정보 취급자 교육, 접근권한 관리, 암호화를 시행합니다.
홈페이지는 이용자 편의를 위해 쿠키를 사용합니다.
제9조(개인정보 처리방침의 변경)
이 처리방침은 2023. 1. 1.부터 시행합니다.`;

  init();
})();
