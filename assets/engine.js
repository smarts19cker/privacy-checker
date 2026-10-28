/* =====================================================================
 * 점검 엔진(공용) — 웹앱(브라우저)과 MCP 서버(Cloudflare Worker)가 같은 코드를 씁니다.
 *  - mask(text)            : 개인정보 비식별(***) 처리
 *  - analyze(text, org, type[, rules]) : 규칙 기반 점검(토큰 0)
 *  - htmlToTextBasic(html) : DOM이 없는 환경(Worker)용 HTML → 텍스트 변환
 * ===================================================================== */
(function (G) {
  'use strict';
  const W = { '필수': 3, '해당시': 2, '권장': 1 };
  /* ---------------- 2) 비식별(가명) 처리 ---------------- */
  const PUBLIC_NUM = new Set(['1833-6972', '118', '1301', '182', '02-2100-3043', '1577-0011']);
  const STOP = new Set(('부서 부서명 직책 직위 직급 연락처 성명 이름 없음 해당 지정 업무 사항 개인정보 정보보호 정보화 보호 담당 담당자 담당부서 책임자 부서장 '
    + '팀장 과장 부장 국장 실장 이사 담당관 감사 기획 총무 전산 행정 운영 보안 정보 시설 민원 홍보 기관 지정하고 지정한 지정합니다 변경 및 또는 의 소속 전화 '
    + '관리 전자우편 이메일 팩스 주소 고충 처리 확인 요청 문의 접수 개인 법정 대리인 위임 본인 정보주체 아래 다음 해당없음').split(' '));
  function mask(t) {
    t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '***@***');
    t = t.replace(/\b\d{6}\s*-\s*[1-8]\d{6}\b/g, '******-*******');
    t = t.replace(/\(?0\d{1,2}\)?[\s.\-)]{0,2}\d{3,4}[\s.\-]\d{4}/g, (m) => PUBLIC_NUM.has(m.trim()) ? m : '***-****-****');
    t = t.replace(/\b1[5-9]\d{2}-\d{4}\b/g, (m) => PUBLIC_NUM.has(m) ? m : '****-****');
    const LBL = '(성\\s*명|이\\s*름|책\\s*임\\s*자|담\\s*당\\s*자|담\\s*당|관리\\s*책임자|대\\s*표\\s*자|접근\\s*권한자|CPO|국내\\s*대리인)';
    t = t.replace(new RegExp(LBL + '(\\s*[:：]?\\s*)([가-힣]{2,4})(?![가-힣])', 'g'), (m, a, b, c) => (STOP.has(c) ? m : a + b + '***'));
    t = t.replace(/(?<![가-힣])([가-힣]{2,4})(\s*)(과장|팀장|부장|국장|실장|주무관|사무관|서기관|대리|주임|차장|본부장|센터장|담당관|이사|상무|전무|원장|처장|소장|관장)(?![가-힣])/g,
      (m, a, b, c) => (STOP.has(a) ? m : '***' + b + c));
    return t;
  }

  /* ---------------- 3) 규칙 기반 점검 (토큰 0) ---------------- */
  const compact = (s) => s.replace(/\s+/g, '');
  const isNumbered = (l) => /^(제\s*\d+\s*조|\d{1,2}\s*[.)]|[①-⑳]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]|[□■▶▣◆○●]|\[|【|<)/.test(l);
  function segment(text, items) {
    const lines = text.split('\n');
    const cands = [];
    lines.forEach((l, i) => {
      if (l.length > 70 || /[:：]\s*\S/.test(l) || /(니다|다)\s*\.?$/.test(l)) return; // 문장·항목값 줄은 제목 후보에서 제외
      const c = compact(l);
      items.forEach((it) => {
        if (it.id === 1) return;
        if (it.heads && it.heads.length && it.heads.some((h) => c.includes(compact(h)))) cands.push({ id: it.id, i, num: isNumbered(l) });
      });
    });
    const lineSet = [...new Set(cands.map((c) => c.i))].sort((a, b) => a - b);
    const nextLine = (i) => lineSet.find((x) => x > i) ?? lines.length;
    const best = {};
    cands.forEach((c) => {
      const len = lines.slice(c.i, nextLine(c.i)).join('\n').length;
      const sc = len * (c.num ? 3 : 1);
      if (!best[c.id] || sc > best[c.id].sc) best[c.id] = { ...c, sc };
    });
    const starts = Object.values(best).sort((a, b) => a.i - b.i);
    const sec = {};
    starts.forEach((s, k) => {
      const end = k + 1 < starts.length ? starts[k + 1].i : lines.length;
      if (end > s.i) sec[s.id] = lines.slice(s.i, end).join('\n');
    });
    const first = starts.length ? starts[0].i : Math.min(lines.length, 15);
    sec[1] = lines.slice(0, Math.max(first, 3)).join('\n');
    return sec;
  }
  const NEG = /(처리하지\s*않|제공하지\s*않|위탁하지\s*않|이전하지\s*않|운영하지\s*않|설치하지\s*않|수집하지\s*않|이용하지\s*않|지정하지\s*않|해당\s*(사항\s*)?없)/;
  const vagueCount = (s) => (s.match(/[가-힣A-Za-z)]\s?등(?=[\s,.)\]·의을를이]|$)/g) || []).length;

  function analyze(text, org, type, R) {
    R = R || G.RULES || (G.window && G.window.RULES);
    const ind = (R.industry && R.industry[type]) || null;
    const items = R.items.filter((it) => !it.public || type === 'public').concat(ind ? ind.items : []);
    const sec = segment(text, items);
    const results = items.map((it) => {
      const s = sec[it.id];
      const base = { id: it.id, g: it.g, level: it.level, title: it.title, basis: it.basis, page: it.page, note: it.note || '', example: (it.example || '').replace(/\{ORG\}/g, org), missing: [], excerpt: '', found: !!s };
      const allScope = !it.heads || !it.heads.length; // 업종별 항목: 문서 전체 기준 점검
      if (!s && !allScope) {
        if (it.level === '해당시' && !(it.trigger && it.trigger.test(text))) return { ...base, status: 'na', score: null, note: '처리방침에서 관련 내용을 찾지 못했습니다. 해당 처리를 하지 않는다면 “해당 개인정보를 처리하지 않습니다”라고 적는 것도 가능합니다.' };
        return { ...base, status: 'bad', score: 0, missing: [{ t: it.level === '해당시' ? '본문에 관련 내용이 있으나 별도 항목이 없음' : '항목 자체가 없음', fix: `“${it.title}” 항목을 새로 만들어 아래 예시처럼 작성하세요.` }] };
      }
      if (s) { base.excerpt = s.slice(0, 600) + (s.length > 600 ? ' …' : ''); base.full = s; }
      else base.excerpt = '(문서 전체 기준 점검)';
      if (s && it.level === '해당시' && NEG.test(s) && s.length < 400) return { ...base, status: 'good', score: 1, note: '해당 처리를 하지 않는다고 명시함' };
      let pass = 0;
      it.checks.forEach((c) => {
        const hay = c.scope === 'all' || !s ? text : s;
        let ok;
        if (c.vague) ok = vagueCount(hay) < c.vague;
        else if (c.bad) ok = !c.bad.test(hay);
        else ok = c.re.test(hay);
        if (ok) pass++; else base.missing.push({ t: c.t, fix: c.fix });
      });
      const ratio = pass / it.checks.length;
      return { ...base, status: ratio === 1 ? 'good' : 'warn', score: Math.max(ratio, 0.2) };
    });
    const globals = R.global.map((g) => {
      const base = { id: g.id, g: 'A', level: g.level, title: g.title, basis: g.basis, page: '', example: (g.example || '').replace(/\{ORG\}/g, org), missing: [], excerpt: '', global: true };
      if (g.cond && !g.cond.test(text)) return { ...base, status: 'na', score: null, note: '해당 표현이 없어 점검 대상이 아님' };
      let ok, hit = '';
      if (g.bad) { const m = text.match(g.bad); ok = !m; if (m) hit = around(text, m.index); }
      else ok = g.re.test(text);
      if (g.cond && !ok) { const m = text.match(g.cond); if (m) hit = around(text, m.index); }
      if (!ok) base.missing.push({ t: g.title, fix: g.fix });
      return { ...base, excerpt: hit || (ok ? '' : '(문서 전체에서 관련 표현을 찾지 못함)'), status: ok ? 'good' : (g.level === '필수' ? 'bad' : 'warn'), score: ok ? 1 : 0 };
    });
    const all = results.concat(globals);
    let num = 0, den = 0;
    all.forEach((r) => { if (r.score === null) return; const w = r.global ? (r.level === '필수' ? 2 : 1) : W[r.level]; num += w * r.score; den += w; });
    const score = den ? Math.round((num / den) * 100) : 0;
    const groups = Object.entries(R.groups).map(([k, name]) => {
      const rs = all.filter((r) => r.g === k && r.score !== null);
      return { k, name, v: rs.length ? Math.round((rs.reduce((a, r) => a + r.score, 0) / rs.length) * 100) : 0 };
    });
    const count = { good: 0, warn: 0, bad: 0, na: 0 };
    all.forEach((r) => count[r.status]++);
    return { results, globals, all, score, groups, count, grade: grade(score), industry: ind ? ind.name : '' };
  }
  const around = (t, i) => '…' + t.slice(Math.max(0, i - 60), i + 90).replace(/\n/g, ' ') + '…';
  function grade(s) {
    if (s >= 90) return { t: '우수', c: '#e3f6e3', f: '#006300' };
    if (s >= 75) return { t: '양호', c: '#e8eefc', f: '#1d4ed8' };
    if (s >= 60) return { t: '보통', c: '#fff4d6', f: '#7a5200' };
    if (s >= 40) return { t: '미흡', c: '#fde7da', f: '#9a3412' };
    return { t: '매우 미흡', c: '#fbe3e3', f: '#9b1c1c' };
  }
  // 개별 항목에 대한 참고 메모(규칙의 note)를 결과에 붙임
  function htmlToTextBasic(html) {
    let t = String(html || '').slice(0, 3000000);
    t = t.replace(/<(script|style|noscript|svg|template|nav|header|form)[\s\S]*?<\/\1>/gi, ' ');
    t = t.replace(/<(td|th)[^>]*>/gi, ' | ');
    t = t.replace(/<\/?(p|div|section|article|h[1-6]|li|ul|ol|tr|table|br|dt|dd|dl|pre|blockquote|tbody|thead|caption|figure|hr)[^>]*>/gi, '\n');
    t = t.replace(/<[^>]+>/g, ' ');
    const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
    t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' '; }
      return ENT[e.toLowerCase()] ?? m;
    });
    return t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  }
  /* 개선사항을 반영한 개인정보 처리방침(안) 자동 생성
   *  - 충족: 현행 유지 / 일부 미흡: 현행 + 보완 문구 / 누락: 작성 예시로 신설
   *  - 구 명칭·‘처리방침 동의’ 문구 등 형식 문제는 자동 정리 */
  function improvedPolicy(A, org, R) {
    R = R || G.RULES || (G.window && G.window.RULES);
    const dropHead = (s) => { const l = String(s || '').split('\n'); return l.length > 1 ? l.slice(1).join('\n') : String(s || ''); };
    const g9 = (R.global.find((g) => g.id === 'G9') || {}).bad;
    const clean = (t) => String(t || '').replace(/개인정보\s*취급\s*방침/g, '개인정보 처리방침')
      .split('\n').filter((l) => !(g9 && g9.test(l))).join('\n').trim();
    const out = [];
    const spec = (id) => R.items.concat(Object.values(R.industry || {}).flatMap((x) => x.items)).find((x) => x.id === id) || {};
    // 현행 본문의 표(“ | ”로 구분된 줄)를 행 데이터로 되살림
    const isRow = (l) => (l.match(/\s\|\s/g) || []).length >= 2 || /^\s*\|/.test(l);
    const cellsOf = (l) => l.split('|').map((c) => c.trim()).filter(Boolean);
    const splitCur = (t) => {
      const lines = String(t || '').split('\n'), keep = [], rows = [];
      lines.forEach((l) => { if (isRow(l) && cellsOf(l).length >= 2) rows.push(cellsOf(l)); else keep.push(l); });
      return { text: keep.join('\n').trim(), rows };
    };
    // 표가 필요한 조항: 현행 표 + (미흡·누락 시) 작성지침 예시 행이 들어간 표
    const withTables = (r, sp, base, tag) => {
      const org2 = (x) => String(x).replace(/\{ORG\}/g, org);
      const cur = splitCur(base);
      const tables = [];
      if (cur.rows.length >= 2) tables.push({ caption: '현행 표', cols: cur.rows[0], rows: cur.rows.slice(1).map((c) => ({ cells: c, ex: false })) });
      if (tag || !cur.rows.length) sp.tables.forEach((t) => tables.push({ caption: t.caption, cols: t.cols.slice(), rows: t.rows.map((c) => ({ cells: c.map(org2), ex: !t.real })) }));
      let text;
      if (!tag) text = clean(cur.text);
      else if (tag === '보완') text = clean(cur.text) + '\n\n[보완 문구]\n' + (r.ai ? clean(r.ai) : org2(sp.tableIntro || ''));
      else text = r.ai ? clean(r.ai) : org2(sp.tableIntro || '');
      return { text: text.trim(), tables };
    };
    A.results.forEach((r) => {
      const fix = r.ai || r.example;
      const sp = spec(r.id);
      if (r.id === 1) {
        out.push({ id: 1, title: `${org} 개인정보 처리방침`, text: clean(r.status === 'good' ? dropHead(r.full) : (r.ai || dropHead(r.example))), tag: r.status === 'good' ? '' : '보완' });
        return;
      }
      if (r.status === 'na') return;
      const tag = !r.full ? (r.status === 'good' ? null : (r.excerpt === '(문서 전체 기준 점검)' ? '보완' : '신설')) : (r.status === 'good' ? '' : r.status === 'warn' ? '보완' : '신설');
      if (tag === null) return;
      const title = r.title.replace(/^\[[^\]]+\]\s*/, '');
      if (sp.tables && !(r.excerpt === '(문서 전체 기준 점검)')) {
        const t = withTables(r, sp, r.full ? dropHead(r.full) : '', tag);
        out.push({ id: r.id, title, text: t.text, tables: t.tables, tag });
        return;
      }
      if (!r.full) { out.push({ id: r.id, title, text: clean(fix), tag }); return; }
      if (tag === '') out.push({ id: r.id, title, text: clean(dropHead(r.full)), tag });
      else if (tag === '보완') out.push({ id: r.id, title, text: clean(dropHead(r.full)) + '\n\n[보완 문구]\n' + clean(fix), tag });
      else out.push({ id: r.id, title, text: clean(fix), tag });
    });
    const g7 = A.globals.find((g) => g.id === 'G7');
    if (g7 && g7.status !== 'good' && g7.status !== 'na') {
      const at = out.findIndex((x) => x.id === 24);
      out.splice(at < 0 ? out.length : at, 0, { id: 'G7', title: '개인정보 유출등 대응', text: g7.ai || g7.example, tag: '신설' });
    }
    const li = out.findIndex((x) => x.id === 24);
    if (li >= 0) out.push(out.splice(li, 1)[0]); // ‘처리방침의 변경’은 항상 마지막 조항
    const last = out.find((x) => x.id === 24);
    if (last && !/부터\s*(적용|시행)/.test(last.text)) last.text += '\n\n이 개인정보 처리방침은 20○○. ○. ○.부터 적용됩니다.';
    return out;
  }

  /* 생성형 AI 서비스 개인정보 처리방침(안) — 작성지침(2026.4.) 부록1, 생성형 AI 개발·활용 안내서(2025.8.), 공공 AX 안내서(2026.7.)
   *  id는 대응하는 본 처리방침 항목 번호(라벨 기호 연결용) */
  function aiPolicy(org) {
    const O = (t) => String(t).replace(/\{ORG\}/g, org);
    const ex = (rows) => rows.map((c) => ({ cells: c.map(O), ex: true }));
    const sec = (id, title, text, tables) => ({ id, title, text: O(text), tables: tables || [], tag: '예시' });
    return [
      { id: 1, title: `${org} 생성형 AI 서비스 개인정보 처리방침`, text: O('{ORG}은(는) 생성형 인공지능(AI) 서비스(이하 “AI 서비스”)를 제공하면서 처리하는 개인정보의 처리 목적, 항목, 보관기간, 학습 활용 여부와 거부 방법 등을 정보주체가 쉽게 알 수 있도록 「개인정보 보호법」 제30조에 따라 다음과 같이 안내합니다. 이 방침은 {ORG} 개인정보 처리방침의 부록으로서, 여기에 정하지 않은 사항은 본 처리방침을 따릅니다.'), tag: '' },
      sec(2, '개인정보의 처리 목적', '{ORG}은(는) 다음의 목적을 위하여 AI 서비스 이용 과정의 개인정보를 처리합니다.\n1. AI 서비스 제공: 이용자의 질문·지시어(프롬프트)에 대한 답변 생성, 대화 이력 제공\n2. 서비스 품질 개선 및 안전성 확보: 오류 분석, 부적절한 입력·출력 차단(필터링), 부정 이용 방지\n3. AI 모델 성능 향상: 이용자 입력 데이터와 이용 이력을 가명처리하여 기존 AI 모델을 재학습\n※ 이용자가 [설정 > 데이터 제어]에서 AI 학습 활용을 거부(Opt-out)한 경우 해당 데이터는 학습 목적으로 처리하지 않습니다.'),
      sec(3, '처리하는 개인정보의 항목', '{ORG}은(는) AI 서비스 제공을 위해 다음의 개인정보를 처리합니다.\n※ 대화창에는 자유롭게 입력할 수 있으므로, 본인 또는 타인의 주민등록번호·건강정보 등 민감한 정보를 입력하지 않도록 주의해 주십시오.', [
        { caption: '① 정보주체의 동의 없이 처리하는 개인정보', cols: ['구분', '법적 근거', '처리 항목', '보유·이용기간'], rows: ex([
          ['입력 데이터', '「개인정보 보호법」 제15조제1항제4호(계약 체결·이행)', '대화창에 입력한 텍스트(질문·지시어), 음성, 첨부파일, 생성된 결과물', '마지막 대화일부터 30일(회원 탈퇴 시 즉시 파기)'],
          ['서비스 이용 기록', '「개인정보 보호법」 제15조제1항제4호(계약 체결·이행)', '이용한 기능, 이용 시간대, 기기·브라우저 정보, 접속기록', '생성일부터 30일']]) },
        { caption: '② 정보주체의 동의를 받아 처리하는 개인정보', cols: ['구분', '법적 근거', '처리 항목', '보유·이용기간'], rows: ex([
          ['AI 맞춤 기능(기억 기능)', '「개인정보 보호법」 제15조제1항제1호(동의)', '이용자가 저장을 허용한 선호·관심사 정보', '동의 철회 또는 회원 탈퇴 시까지']]) }]),
      sec(5, '대화 내용의 보관기간', '{ORG}은(는) 대화 내용을 마지막 대화일부터 30일 동안 보관한 후 지체 없이 파기합니다. 이용자가 [대화 기록 삭제] 기능으로 직접 삭제하면 지체 없이 삭제하며, AI 학습에 활용하는 데이터는 가명처리하여 최대 ○년간 보관합니다.'),
      sec(7, '개인정보의 제3자 제공', '{ORG}은(는) 이용자가 AI 서비스에서 제휴 서비스(예약·주문 등) 연결을 요청하고 동의한 경우에만 다음과 같이 개인정보를 제공합니다. {ORG}은(는) 이용자가 입력한 어떠한 정보(프롬프트)도 이용자의 명시적인 사전 동의 없이 외부 기업이나 제3자의 AI 모델 학습용으로 판매하거나 제공하지 않습니다.', [
        { caption: '제휴 서비스 연결 시 제3자 제공', cols: ['제공받는 자', '제공 목적', '제공 항목', '보유·이용기간'], rows: ex([['<외식예약플랫폼>', '식당 예약', '예약자 이름, 연락처, 예약 일시·인원', '예약 이행 완료 시까지']]) }]),
      sec(8, '추가적인 이용·제공의 판단 기준', '{ORG}은(는) 「개인정보 보호법」 제15조제3항 및 같은 법 시행령 제14조의2에 따라 대화 데이터를 AI 모델 성능 향상에 추가적으로 이용할 수 있으며, 이 경우 ▲당초 수집 목적(AI 서비스 제공)과의 상당한 관련성 ▲이용자가 합리적으로 예측할 수 있는지 여부 ▲정보주체 이익의 부당한 침해 여부(학습 거부권 보장) ▲가명처리 등 안전성 확보조치 여부를 고려합니다. 학습 데이터 수집 사실과 거부 방법은 대화창 알림으로 상시 안내합니다.'),
      sec(9, '개인정보 처리업무의 위탁', '{ORG}은(는) 답변 생성을 위해 외부 생성형 AI 모델(API)을 이용하며, 이는 개인정보 처리업무의 위탁에 해당합니다. 수탁자와는 기업용(Enterprise) 계약을 체결하여 전송된 데이터가 수탁자의 AI 모델 학습에 사용되지 않도록 하고, 「개인정보 보호법」 제26조에 따라 관리·감독합니다.', [
        { caption: 'AI 관련 위탁 현황', cols: ['수탁자', '위탁 업무', '처리 항목', '재위탁 여부'], rows: ex([['○○ AI(주)', '생성형 AI 모델(API)을 통한 답변 생성', '입력 데이터, 생성 결과물', '없음']]) }]),
      sec(10, '개인정보의 국외 이전', '{ORG}은(는) 「개인정보 보호법」 제28조의8제1항제3호에 따라 AI 서비스 제공(답변 생성)을 위해 다음과 같이 개인정보를 국외로 이전합니다. 이용자는 개인정보 보호 담당부서에 국외 이전 거부를 요청할 수 있으며, 거부 시 AI 서비스 이용이 제한될 수 있습니다.', [
        { caption: 'AI 관련 국외 이전 현황', cols: ['이전받는 자(연락처)', '이전 국가', '이전 일시·방법', '이전 항목', '이용 목적·보유기간'], rows: ex([['○○ AI Inc.(***)', '미국', 'AI 서비스 이용 시 네트워크 전송', '입력 데이터, 생성 결과물', '답변 생성 / 처리 후 30일 이내 파기']]) }]),
      sec(13, '가명정보의 처리(AI 학습)', '{ORG}은(는) AI 모델 학습에 활용하는 대화 데이터에 포함된 개인정보를 「개인정보 보호법」 제28조의2에 따라 가명처리하여 과학적 연구 목적으로 이용합니다. 학습 데이터셋 투입 전 주민등록번호·전화번호 등 식별정보를 자동 탐지하여 삭제·대체하고, 추가정보는 분리 보관합니다.'),
      sec(16, '정보주체의 권리와 행사 방법(학습 거부 포함)', '① 이용자는 언제든지 [설정 > 데이터 제어 > AI 학습 활용]에서 자신의 데이터가 AI 학습에 쓰이지 않도록 거부(Opt-out)할 수 있습니다.\n② 이용자는 [대화 기록]에서 대화를 직접 삭제할 수 있으며, 개인정보 열람·정정·삭제·처리정지를 요구할 수 있습니다.\n③ 이미 학습에 반영된 데이터는 기술적 특성상 개별 삭제가 제한될 수 있으며, 이 경우 출력 단계 필터링 등 대체 조치를 안내합니다.'),
      sec(17, '자동화된 결정(해당 시)', 'AI 서비스 결과가 정보주체의 권리·의무에 중대한 영향을 미치는 결정(예: 자격 심사)에 완전히 자동화된 방식으로 쓰이는 경우, {ORG}은(는) 「개인정보 보호법」 제37조의2에 따라 그 사실과 기준·절차를 공개하고, 정보주체의 거부·설명 요구를 보장합니다. 해당하지 않으면 “자동화된 결정을 하지 않습니다”라고 적습니다.'),
      sec(11, 'AI 서비스의 안전성 확보조치', '{ORG}은(는) 「개인정보의 안전성 확보조치 기준」에 따른 조치와 함께 ▲학습데이터 수집 출처 검증 ▲프롬프트 입력·출력 필터링으로 개인정보 노출 방지 ▲AI 프라이버시 레드팀 운영 ▲외부 API 연계 시 전송 구간 암호화 등 AI 특화 안전조치를 시행합니다.')
    ];
  }

  /* 주요 개인정보 처리 표시(라벨링) — 작성지침(2026.4.) Ⅴ장
   *  kind: type(개인정보 유형) · step(처리 단계) · right(보호 의무·권리) / to: 연결할 조항 id */
  function policyLabels(out, R) {
    R = R || G.RULES || (G.window && G.window.RULES);
    const cellsTxt = (x) => (x.tables || []).map((t) => t.rows.map((r) => r.cells.join(' ')).join('\n')).join('\n');
    const by = (id) => { const x = out.find((y) => y.id === id); return x ? x.text + '\n' + cellsTxt(x) : ''; };
    const has = (id) => out.some((x) => x.id === id);
    const hasRows = (id) => { const x = out.find((y) => y.id === id); return !!(x && (x.tables || []).some((t) => t.rows.length)); };
    // 이용자에게 ‘입력하지 말라’고 안내하는 문장 등은 수집 사실로 보지 않음
    const all = out.map((x) => x.text + '\n' + cellsTxt(x)).join('\n').split('\n').filter((l) => !/(입력하지\s*않도록|주의해\s*주십시오|입력하지\s*마|자동\s*탐지|삭제·대체)/.test(l)).join('\n');
    const neg = (t, id) => !hasRows(id) && /(하지\s*않|해당\s*(사항\s*)?없)/.test(t) && t.length < 300;
    const uniq = (a) => [...new Set(a)];
    const short = (a, n) => (a.length > n ? a.slice(0, n).join(', ') + ` 외 ${a.length - n}개` : a.join(', '));
    let fields = (R.dict.fields || []).filter((f) => all.includes(f.replace(/\(.*\)/, '')) && !/주민등록번호|외국인등록번호|건강정보/.test(f));
    if (fields.includes('이름')) fields = fields.filter((f) => f !== '성명');
    if (fields.includes('휴대전화번호')) fields = fields.filter((f) => f !== '전화번호');
    const L = [];
    L.push({ img: 'personal', key: 'collect', kind: 'type', icon: '👤', name: '일반 개인정보 수집', value: fields.length ? short(fields, 3) : '본문 참조', to: 3 });
    if (/민감\s*정보|건강\s*(정보|상태)|장애/.test(all)) L.push({ img: 'sensitive', key: 'sensitive', kind: 'type', icon: '❤️', name: '민감정보', value: short(uniq((all.match(/건강\s*(정보|상태)|장애\s*(정보|유무)?|병력|장기요양\s*등급/g) || ['민감정보']).map((x) => x.replace(/\s+/g, ''))), 2), to: 3 });
    const uid = uniq((all.match(/주민\s*등록\s*번호|여권\s*(번호|정보)|운전\s*면허\s*번호|외국인\s*등록\s*번호/g) || []).map((x) => x.replace(/\s+/g, '')));
    if (uid.length) L.push({ img: 'unique', key: 'unique', kind: 'type', icon: '🔑', name: '고유식별정보', value: short(uid, 2), to: 3 });
    if (has(21)) L.push({ img: 'video', key: 'video', kind: 'type', icon: '▶️', name: '개인영상정보', value: 'CCTV 운영', to: 21 });
    if (has(13) && !neg(by(13), 13)) L.push({ img: 'pseudo', key: 'pseudo', kind: 'type', icon: '🎭', name: '가명정보', value: '통계·연구 목적', to: 13 });
    const purposes = (by(2).match(/(?:^|\n)\s*(?:\d+[.)]|•|-|[①-⑳])\s*([^:\n—]{2,18})/g) || []).map((x) => x.replace(/^[\s\n]*(?:\d+[.)]|•|-|[①-⑳])\s*/, '').trim()).filter((x) => !/개인정보/.test(x));
    L.push({ img: 'purpose', key: 'purpose', kind: 'step', icon: '🎯', name: '처리 목적', value: purposes.length ? short(uniq(purposes), 2) : '본문 참조', to: 2 });
    const periods = uniq((by(5).match(/(\d+\s*(년|개월|일)|회원\s*탈퇴\s*시까지|목적\s*달성\s*시까지|동의\s*철회\s*시까지)/g) || []).map((x) => x.replace(/\s+/g, ' ')));
    L.push({ img: 'period', key: 'period', kind: 'step', icon: '⏳', name: '보유기간', value: periods.length ? short(periods, 2) : '본문 참조', to: 5 });
    L.push({ img: 'provide', key: 'provide', kind: 'step', icon: '🤝', name: '제3자 제공', value: has(7) && !neg(by(7), 7) ? '있음(제공받는 자 본문 참조)' : '제공하지 않음', to: has(7) ? 7 : null });
    L.push({ img: 'entrust', key: 'entrust', kind: 'step', icon: '🏢', name: '처리 위탁', value: has(9) && !neg(by(9), 9) ? '있음(수탁자 본문 참조)' : '위탁하지 않음', to: has(9) ? 9 : null });
    if (has(10) && !neg(by(10), 10)) L.push({ img: 'abroad', key: 'abroad', kind: 'step', icon: '🌐', name: '국외 이전', value: '있음(국가·이전받는 자 본문 참조)', to: 10 });
    if (has(14) && !neg(by(14), 14)) L.push({ img: 'auto', key: 'auto', kind: 'step', icon: '🍪', name: '자동 수집(쿠키)', value: '거부 방법 안내', to: 14 });
    L.push({ img: 'destroy', key: 'destroy', kind: 'step', icon: '🗑️', name: '파기', value: '목적 달성 시 지체 없이', to: 6 });
    if (has(4) && !neg(by(4), 4)) L.push({ img: 'guardian', key: 'child', kind: 'right', icon: '👨‍👧', name: '법정대리인 권리', value: '14세 미만 보호자 동의', to: 4 });
    L.push({ img: 'rights', key: 'rights', kind: 'right', icon: '📝', name: '정보주체 권리', value: '열람·정정·삭제·처리정지', to: 16 });
    L.push({ img: 'safety', key: 'safety', kind: 'right', icon: '🛡️', name: '안전성 확보조치', value: '관리·기술·물리적 조치', to: 11 });
    const dept = (by(18).match(/(?:담당\s*부서|부서명?)\s*[:：]?\s*([가-힣A-Za-z0-9]{2,15}(?:과|팀|실|센터|부|국|처))/) || [])[1];
    L.push({ img: 'cpo', key: 'cpo', kind: 'right', icon: '🧑‍💼', name: '개인정보 보호책임자', value: '성명·연락처 본문 참조', to: 18 });
    L.push({ img: 'contact', key: 'contact', kind: 'right', icon: '🎧', name: '고충처리 부서', value: dept || '개인정보 보호 담당부서', to: 18 });
    if (has(28)) L.push({ img: 'access', key: 'access', kind: 'right', icon: '📂', name: '열람청구', value: '열람청구 접수·처리 부서', to: 28 });
    L.push({ img: 'remedy', key: 'remedy', kind: 'right', icon: '⚖️', name: '권익침해 구제', value: '118 · 1833-6972', to: has(20) ? 20 : null });
    const eff = (by(24).match(/(\d{4}|20○○)\s*\.\s*[○\d]{1,2}\s*\.\s*[○\d]{1,2}\s*\.?(?=\s*부터)/) || [])[0];
    L.push({ img: 'change', key: 'change', kind: 'right', icon: '🔄', name: '처리방침 변경', value: eff ? eff.replace(/\s+/g, '') + ' 시행' : '변경 이력 본문 참조', to: 24 });
    return L;
  }
  /* 조항(제목)별 라벨 기호 — 작성지침 Ⅴ장 분류(type: 개인정보 유형 / step: 처리 단계 / right: 보호 의무·권리) */
  const ART_ICON = {
    1: [], 2: [['🎯', 'step', '처리 목적', 'purpose']], 3: [['👤', 'step', '처리 항목', 'items']], 4: [['👨‍👧', 'right', '법정대리인 권리', 'guardian']],
    5: [['⏳', 'step', '보유기간', 'period']], 6: [['🗑️', 'step', '파기', 'destroy']], 7: [['🤝', 'step', '제3자 제공', 'provide']], 8: [['🔁', 'step', '추가적 이용·제공', 'additional']],
    9: [['🏢', 'step', '처리 위탁', 'entrust']], 10: [['🌐', 'step', '국외 이전', 'abroad']], 11: [['🛡️', 'right', '안전성 확보조치', 'safety']], 12: [['❤️', 'right', '민감정보 공개 가능성', 'sensitive_open']],
    13: [['🎭', 'step', '가명정보 처리', 'pseudo']], 14: [['🍪', 'step', '자동 수집 장치', 'auto']], 15: [['👣', 'step', '행태정보 수집', 'behavior']], 16: [['📝', 'right', '정보주체 권리', 'rights']],
    17: [['🤖', 'right', '자동화된 결정', '']], 18: [['🧑‍💼', 'right', '개인정보 보호책임자', 'cpo'], ['🎧', 'right', '고충처리 부서', 'contact']], 19: [['🧑‍💼', 'right', '국내대리인', 'agent']], 20: [['⚖️', 'right', '권익침해 구제', 'remedy']],
    21: [['▶️', 'right', '고정형 영상정보처리기기', 'cctv']], 22: [['🎥', 'right', '이동형 영상정보처리기기', 'mobile']], 23: [['🏅', 'right', '개인정보 보호 인증', 'cert']], 24: [['🔄', 'right', '처리방침 변경', 'change']],
    25: [['📤', 'right', '전송요구권', '']], 26: [['🤖', 'step', '생성형 AI', '']], 27: [['📁', 'right', '개인정보파일', 'level']], 28: [['📂', 'right', '열람청구', 'access']],
    29: [['🔑', 'type', '고유식별정보', 'unique'], ['🛂', 'type', '여권번호', 'passport']], 30: [['❤️', 'type', '건강정보', 'health']], 31: [['📄', 'type', '주민등록번호', 'rrn']], G7: [['🚨', 'right', '유출등 대응', '']]
  };
  function articleIcons(out) {
    const labels = policyLabels(out), map = {};
    out.forEach((s) => {
      const list = (ART_ICON[s.id] || []).map(([icon, kind, name, img]) => ({ icon, kind, name, img }));
      labels.filter((l) => l.to === s.id && l.kind === 'type').forEach((l) => { if (!list.some((x) => x.img === l.img)) list.push({ icon: l.icon, kind: l.kind, name: l.name, img: l.img }); });
      map[s.id] = list;
    });
    return map;
  }
  function tableText(s, md) {
    return (s.tables || []).map((t) => md
      ? `\n**${t.caption}**\n| ${t.cols.join(' | ')} |\n|${t.cols.map(() => '---').join('|')}|\n` + t.rows.map((r) => `| ${r.cells.join(' | ')}${r.ex ? ' (예시)' : ''} |`).join('\n')
      : `\n[${t.caption}]\n${t.cols.join(' | ')}\n` + t.rows.map((r) => (r.ex ? '(예시) ' : '') + r.cells.join(' | ')).join('\n')).join('\n');
  }
  function improvedText(out) {
    const sec = out.slice(1);
    const labels = policyLabels(out);
    return [`<${out[0].title}>`, out[0].text, '', '[주요 개인정보 처리 표시(라벨링)]', ...labels.map((l) => `${l.icon} ${l.name}: ${l.value}`),
      '※ 위 라벨은 처리방침의 주요 내용을 요약한 것으로, 자세한 내용은 아래 본문에서 확인하실 수 있습니다.', '', '[목차]', ...sec.map((s, i) => `${i + 1}. ${s.title}`), '',
      ...sec.map((s, i) => `${(articleIcons(out)[s.id] || []).map((x) => x.icon).join('')} 제${i + 1}조(${s.title})${s.tag ? ' [' + s.tag + ']' : ''}\n${s.text}${tableText(s, true)}\n`)].join('\n');
  }
  /* 신구대조표: 현행 · 개정안 · 비고(사유)
   *  rows: { title, cur, neu, add(개정안 중 새로 더한 부분), reason, kind: '신설'|'보완'|'정비'|'' } */
  function comparisonRows(A, out, org) {
    const rows = [];
    const res = (id) => A.results.find((r) => r.id === id) || A.globals.find((g) => g.id === id);
    const why = (r) => r ? r.missing.map((m) => m.t).join(' / ') + (r.basis && r.basis[0] ? ` (근거: ${r.basis[0]})` : '') : '';
    const gl = (id) => A.globals.find((g) => g.id === id);
    // 1) 제목·서문
    const r1 = res(1), g1 = gl('G1'), g9 = gl('G9');
    const fix1 = [r1 && r1.status !== 'good' ? why(r1) : '', g1 && g1.status === 'bad' ? '구 명칭 정비(개인정보취급방침 → 개인정보 처리방침)' : '', g9 && g9.status === 'bad' ? '‘처리방침 동의’ 문구 삭제(동의는 별도 동의서로)' : ''].filter(Boolean).join(' / ');
    rows.push({ title: '제목 및 서문', cur: (r1 && r1.full) || '', neu: `${out[0].title}\n${out[0].text}`, add: '', reason: fix1, kind: fix1 ? '정비' : '' });
    // 2) 라벨링
    const g6 = gl('G6'), labels = policyLabels(out);
    rows.push({ title: '주요 개인정보 처리 표시(라벨링)', cur: g6 && g6.status === 'good' ? '(현행 라벨 있음)' : '(없음)', neu: labels.map((l) => `${l.icon} ${l.name}: ${l.value}`).join('\n'), add: '', reason: g6 && g6.status === 'good' ? '라벨 내용을 개정안에 맞게 갱신' : '라벨링 신설 — 처리방침 핵심 사항을 기호로 요약(작성지침 Ⅴ장)', kind: g6 && g6.status === 'good' ? '보완' : '신설' });
    // 3) 목차
    const g5 = gl('G5'), sec = out.slice(1);
    rows.push({ title: '목차', cur: g5 && g5.status === 'good' ? '(현행 목차 있음)' : '(없음)', neu: sec.map((s, i) => `${i + 1}. ${s.title}`).join('\n'), add: '', reason: g5 && g5.status === 'good' ? '조항 추가·순서 정비, 클릭 시 해당 조항으로 이동' : '목차 신설, 클릭 시 해당 조항으로 이동(작성지침 p.16)', kind: g5 && g5.status === 'good' ? '보완' : '신설' });
    // 4) 조항별
    const icons = articleIcons(out);
    sec.forEach((s, i) => {
      const r = res(s.id);
      const head = `${(icons[s.id] || []).map((x) => x.icon).join('')} 제${i + 1}조(${s.title})`.trim();
      const full = s.text + tableText(s, false);
      if (!s.tag) { rows.push({ title: head, cur: (r && r.full) || full, neu: full, add: '', reason: '', kind: '' }); return; }
      if (s.tag === '신설') { rows.push({ title: head, cur: '(없음)', neu: full, add: full, reason: '신설: ' + (s.id === 'G7' ? '2026.9.11. 시행 개정법의 ‘유출등’(위조·변조·훼손 포함)·72시간 통지 반영' : why(r)), kind: '신설' }); return; }
      const k = full.indexOf('[보완 문구]');
      const base = k >= 0 ? full.slice(0, k).trim() : '';
      rows.push({ title: head, cur: (r && r.full) || base || '(문서 전체 기준 점검 항목)', neu: full, add: k >= 0 ? full.slice(k) : full, reason: '보완: ' + why(r), kind: '보완' });
    });
    return rows;
  }
  function comparisonText(rows, org) {
    const cell = (t, n) => String(t || '').replace(/\|/g, '¦').replace(/\n+/g, '<br>').slice(0, n);
    return [`# ${org} 개인정보 처리방침 신구대조표`, '| 구분 | 현행 | 개정안 | 비고(사유) |', '|---|---|---|---|',
      ...rows.map((r) => `| ${r.title}${r.kind ? ' [' + r.kind + ']' : ''} | ${cell(r.cur, 260)} | ${cell(r.add || r.neu, 360)} | ${cell(r.reason || '변경 없음', 220)} |`)].join('\n');
  }
  G.PrivacyEngine = { mask, analyze, grade, htmlToTextBasic, improvedPolicy, improvedText, policyLabels, articleIcons, comparisonRows, comparisonText, tableText, aiPolicy, W };
})(typeof globalThis !== 'undefined' ? globalThis : window);
