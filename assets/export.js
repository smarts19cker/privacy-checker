/* =====================================================================
 * 통합 보고서 내보내기 — PDF(화면 인쇄) · DOCX(워드) · HWPX(한글)
 *  - 외부 라이브러리 없이 브라우저에서 직접 파일을 만듭니다(무압축 ZIP).
 *  - 보고서 구성: ① 점검 결과 ② 개선 방법 및 근거 ③ 개선 후 개인정보 처리방침(안)
 *                 ④ 신구대조표 ⑤ 어린이·청소년·어르신별 처리방침(안) ⑥ 생성형 AI 서비스 처리방침(안)
 * ===================================================================== */
(function () {
  'use strict';
  const S = window.APP;
  const E = () => window.PrivacyEngine;
  const ST = { good: '충족', warn: '일부 미흡', bad: '누락', na: '해당여부 확인' };

  /* ---------- 공통 문서 모델 ---------- */
  // 블록: {t:'h1'|'h2'|'h3'|'p'|'pb', text, style:'add'|'ex'|'small'|'bold'} / {t:'table', cols, rows:[[cell]], widths, rowStyle:[]}
  // cell: 문자열 또는 {text, style}
  function policyBlocks(B, out, heading) {
    const sec = out.slice(1);
    const labels = E().policyLabels(out);
    const icons = E().articleIcons(out);
    const KIND = { type: '개인정보 유형', step: '처리 단계', right: '보호 의무·권리' };
    B.push({ t: 'h3', text: out[0].title });
    out[0].text.split('\n').filter(Boolean).forEach((l) => B.push({ t: 'p', text: l }));
    B.push({ t: 'p', text: '■ 주요 개인정보 처리 표시(라벨링)', style: 'bold' });
    B.push({ t: 'table', cols: ['구분', '라벨', '내용'], widths: [20, 30, 50], rows: labels.map((l) => [KIND[l.kind], l.name, l.value]) });
    B.push({ t: 'p', text: '※ 위 라벨은 개인정보 처리방침의 주요 내용을 요약한 것으로, 자세한 내용은 아래 본문에서 확인하실 수 있습니다.', style: 'small' });
    B.push({ t: 'p', text: '■ 목차', style: 'bold' });
    sec.forEach((s, i) => B.push({ t: 'p', text: `  제${i + 1}조 ${s.title}` }));
    sec.forEach((s, i) => {
      const lb = (icons[s.id] || []).map((x) => x.name).join('·');
      B.push({ t: 'h3', text: `제${i + 1}조(${s.title})${s.tag ? ` [${s.tag}]` : ''}${lb ? `  〔라벨: ${lb}〕` : ''}` });
      let add = false;
      s.text.split('\n').forEach((l) => {
        if (/^\[보완 문구\]/.test(l)) add = true;
        if (l.trim()) B.push({ t: 'p', text: l, style: add || s.tag === '신설' ? 'add' : '' });
      });
      (s.tables || []).forEach((t) => {
        B.push({ t: 'p', text: t.caption, style: 'bold' });
        B.push({ t: 'table', cols: t.cols, rows: t.rows.map((r) => r.cells.map((c, ci) => ({ text: (ci === 0 && r.ex ? '(예시) ' : '') + c, style: r.ex ? 'ex' : '' }))) });
      });
    });
  }

  function reportModel() {
    const A = S.A, org = S.org, today = new Date().toLocaleDateString('ko-KR'), R = window.RULES;
    const issues = A.all.filter((r) => r.status === 'warn' || r.status === 'bad');
    const okList = A.all.filter((r) => r.status === 'good');
    const naList = A.all.filter((r) => r.status === 'na');
    const B = [];
    B.push({ t: 'h1', text: '개인정보 처리방침 적정성 점검 보고서' });
    B.push({ t: 'table', cols: ['구분', '내용'], widths: [22, 78], rows: [
      ['기관명', `${org} (${S.type === 'public' ? '공공기관' : A.industry ? '민간 · ' + A.industry : '민간'})`],
      ['점검 대상', S.url || '직접 입력한 내용'], ['점검일', today],
      ['점검 기준', `「개인정보 보호법」(${R.meta.lawEffective} 시행) 제30조, 시행령 제31조 등 기준 자료 ${R.meta.refs.length}종`],
      ['종합 결과', `${A.score}점 / 100 (${A.grade.t}) — 충족 ${A.count.good} · 일부 미흡 ${A.count.warn} · 누락 ${A.count.bad} · 해당여부 확인 ${A.count.na}`],
      ['비식별', '성명·전화번호·전자우편 등 개인정보는 *** 로 표시함']] });
    B.push({ t: 'p', text: '보고서 구성: ① 점검 결과 ② 개선 방법 및 근거 ③ 개선 후 개인정보 처리방침(안) ④ 신구대조표 ⑤ 어린이·청소년·어르신별 개인정보 처리방침(안) ⑥ 생성형 AI 서비스 개인정보 처리방침(안)', style: 'small' });

    B.push({ t: 'h2', text: '1. 점검 결과' });
    B.push({ t: 'h3', text: '1-1. 항목별 점검 결과' });
    B.push({ t: 'table', cols: ['번호', '점검 항목', '구분', '결과'], widths: [10, 56, 14, 20], rows: A.all.map((r) => [String(r.id), r.title, r.level, ST[r.status]]) });
    B.push({ t: 'h3', text: `1-2. 충족 항목 (${okList.length}건)` });
    B.push({ t: 'p', text: okList.map((r) => r.id + ' ' + r.title).join(' · ') || '없음' });
    B.push({ t: 'h3', text: `1-3. 해당 여부 확인이 필요한 항목 (${naList.length}건)` });
    B.push({ t: 'p', text: naList.map((r) => r.id + ' ' + r.title).join(' · ') || '없음' });

    B.push({ t: 'pb' }, { t: 'h2', text: `2. 개선 방법 및 근거 (${issues.length}건)` });
    issues.forEach((r) => {
      B.push({ t: 'h3', text: `${r.global ? '[형식·최신성] ' + r.id : r.id + '.'} ${r.title} — ${ST[r.status]} (${r.level})` });
      B.push({ t: 'table', cols: ['구분', '내용'], widths: [20, 80], rows: [
        ['기관명', org], ['현행 내용', r.excerpt || '해당 항목을 찾을 수 없습니다.'],
        ['미흡한 부분', r.missing.map((m) => '• ' + m.t).join('\n')],
        ['개선 방법', r.missing.map((m) => '• ' + m.fix).join('\n')],
        ['작성 예시', { text: (r.ai || r.example || ''), style: 'add' }],
        ['근거', r.basis.join('\n') + (r.page ? '\n' + r.page : '')]] });
    });

    B.push({ t: 'pb' }, { t: 'h2', text: '3. 개선 후 개인정보 처리방침(안)' });
    B.push({ t: 'p', text: '[보완]은 현행 내용에 문구를 더한 조항, [신설]은 새로 넣은 조항, (예시)는 작성지침 예시 행입니다. ○○ 부분은 실제 처리 현황으로 채우세요.', style: 'small' });
    policyBlocks(B, S.improved);

    B.push({ t: 'pb' }, { t: 'h2', text: '4. 신구대조표 (현행 · 개정안 · 비고)' });
    const rows = E().comparisonRows(A, S.improved, org);
    B.push({ t: 'table', cols: ['구분', `${org} 현행`, `${org} 개정안`, '비고(사유)'], widths: [14, 34, 36, 16],
      rows: rows.map((r) => [r.title + (r.kind ? `\n[${r.kind}]` : ''), r.cur || '', { text: r.neu, style: r.kind ? 'add' : '' }, { text: r.reason || '', style: 'small' }]) });

    B.push({ t: 'pb' }, { t: 'h2', text: '5. 어린이 · 청소년 · 어르신별 개인정보 처리방침(안)' });
    ['child', 'teen', 'senior'].forEach((k, i) => {
      const d = S.audienceData ? S.audienceData(k) : null; if (!d) return;
      B.push({ t: 'h3', text: `5-${i + 1}. ${S.audienceName[k]} 개인정보 처리방침(안)` });
      B.push({ t: 'p', text: d.title, style: 'bold' }, { t: 'p', text: d.intro });
      B.push({ t: 'table', cols: ['질문', '핵심 내용', '예시'], widths: [26, 50, 24], rows: (d.cards || []).map((c) => [`${c.icon || ''} ${c.q}`, (c.a || []).map((x) => '• ' + x).join('\n'), c.ex || '']) });
      B.push({ t: 'p', text: '📞 ' + d.help }); if (d.outro) B.push({ t: 'p', text: d.outro });
    });

    B.push({ t: 'pb' }, { t: 'h2', text: '6. 생성형 AI 서비스 개인정보 처리방침(안)' });
    B.push({ t: 'p', text: '생성형 AI(챗봇·AI 비서 등)를 운영하거나 외부 AI(API)를 연동하는 경우 본 처리방침의 부록으로 함께 공개합니다(작성지침 부록1, 생성형 AI 개발·활용 안내서 2025.8. 기준 예시).', style: 'small' });
    policyBlocks(B, S.aiPolicy);
    B.push({ t: 'p', text: '※ 본 보고서는 규칙 기반 자동 점검 결과이며 법률 자문이 아닙니다. 게시 전 개인정보 보호책임자의 검토가 필요합니다.', style: 'small' });
    return B;
  }

  /* ---------- ZIP(무압축) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files, mime) {
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    files.forEach(([name, data]) => {
      const n = enc.encode(name), d = typeof data === 'string' ? enc.encode(data) : data, c = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, c, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
      parts.push(new Uint8Array(h.buffer), n, d);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, c, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true); ch.setUint16(28, n.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), n);
      off += 30 + n.length + d.length;
    });
    const cs = cen.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: mime });
  }
  const X = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cellOf = (c) => (typeof c === 'object' && c ? c : { text: String(c ?? ''), style: '' });

  /* ---------- DOCX ---------- */
  function docx(B) {
    const W = 9638; // A4 본문 폭(twip)
    const run = (t, st) => {
      const rp = [st === 'add' ? '<w:color w:val="1D4ED8"/>' : '', st === 'ex' ? '<w:i/><w:color w:val="6B6B6B"/>' : '', st === 'small' ? '<w:sz w:val="18"/><w:color w:val="555555"/>' : '', st === 'bold' || st === 'th' ? '<w:b/>' : ''].join('');
      return `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ''}<w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
    };
    const para = (t, st, pStyle) => `<w:p>${pStyle ? `<w:pPr><w:pStyle w:val="${pStyle}"/></w:pPr>` : ''}${run(t, st)}</w:p>`;
    const table = (b) => {
      const n = b.cols.length, ws = (b.widths || b.cols.map(() => 100 / n)).map((p) => Math.round(W * p / 100));
      const tc = (c, i, head) => { c = cellOf(c); const ps = String(c.text).split('\n'); return `<w:tc><w:tcPr><w:tcW w:w="${ws[i]}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="E8ECF4"/>' : ''}</w:tcPr>${ps.map((x) => `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${run(x, head ? 'th' : c.style)}</w:p>`).join('')}</w:tc>`; };
      return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>
        <w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
        <w:tr><w:trPr><w:tblHeader/></w:trPr>${b.cols.map((c, i) => tc(c, i, true)).join('')}</w:tr>
        ${b.rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => tc(c, i, false)).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`;
    };
    const body = B.map((b) => b.t === 'h1' ? para(b.text, '', 'Title') : b.t === 'h2' ? para(b.text, '', 'Heading1') : b.t === 'h3' ? para(b.text, '', 'Heading2')
      : b.t === 'pb' ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : b.t === 'table' ? table(b) : para(b.text, b.style)).join('\n');
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const font = '<w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕" w:cs="Malgun Gothic"/>';
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="20"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
      <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3A8A"/><w:sz w:val="30"/></w:rPr></w:style>
      <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
    </w:styles>`;
    return zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
      ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['word/document.xml', doc], ['word/styles.xml', styles]
    ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  /* ---------- HWPX(한글) ---------- */
  function hwpx(B) {
    const T = window.HWPX_TPL; if (!T) throw new Error('HWPX 템플릿이 없습니다.');
    const CP = { h1: 7, h2: 8, h3: 9, bold: 10, add: 11, small: 12, ex: 13, th: 10, '': 0 };
    const BF = { cell: 3, head: 4 };
    let id = 1000;
    const nid = () => String(++id);
    const p = (text, cp, pb) => `<hp:p id="${nid()}" paraPrIDRef="0" styleIDRef="0" pageBreak="${pb ? 1 : 0}" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${X(text)}</hp:t></hp:run></hp:p>`;
    const TW = 42520; // 본문 폭(HWPUNIT)
    const table = (b) => {
      const n = b.cols.length, ws = (b.widths || b.cols.map(() => 100 / n)).map((x) => Math.round(TW * x / 100));
      const all = [b.cols.map((c) => ({ text: c, style: 'th' }))].concat(b.rows.map((r) => r.map(cellOf)));
      const tc = (c, ci, ri) => `<hp:tc name="" header="${ri === 0 ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${ri === 0 ? BF.head : BF.cell}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${ri === 0 ? 'CENTER' : 'TOP'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${String(c.text).split('\n').map((x) => p(x, CP[c.style] ?? 0, false)).join('')}</hp:subList><hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${ws[ci]}" height="282"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
      return `<hp:p id="${nid()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="${nid()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${all.length}" colCnt="${n}" cellSpacing="0" borderFillIDRef="${BF.cell}" noAdjust="0"><hp:sz width="${TW}" widthRelTo="ABSOLUTE" height="${282 * all.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${all.map((r, ri) => `<hp:tr>${r.map((c, ci) => tc(c, ci, ri)).join('')}</hp:tr>`).join('')}</hp:tbl></hp:run></hp:p>` + p('', 0, false);
    };
    let pendingPB = false;
    const body = B.map((b) => {
      if (b.t === 'pb') { pendingPB = true; return ''; }
      const pb = pendingPB; pendingPB = false;
      if (b.t === 'table') return (pb ? p('', 0, true) : '') + table(b);
      const cp = b.t === 'h1' ? CP.h1 : b.t === 'h2' ? CP.h2 : b.t === 'h3' ? CP.h3 : (CP[b.style] ?? 0);
      return p(b.text, cp, pb);
    }).join('');
    const section = T.secHead + T.secFirst + body + '</hs:sec>';
    const hpf = T.files['Contents/content.hpf'].replace('<opf:title/>', `<opf:title>${X(S.org)} 개인정보 처리방침 점검 보고서</opf:title>`).replace(/synthetic-fixture-author/g, '개인정보 처리방침 점검 에이전트');
    return zip([
      ['mimetype', 'application/hwp+zip'],
      ['version.xml', T.files['version.xml']],
      ['Contents/header.xml', T.header],
      ['Contents/section0.xml', section],
      ['Contents/content.hpf', hpf],
      ['settings.xml', T.files['settings.xml']],
      ['META-INF/container.xml', T.files['META-INF/container.xml']],
      ['META-INF/container.rdf', T.files['META-INF/container.rdf']],
      ['META-INF/manifest.xml', T.files['META-INF/manifest.xml']],
      ['Preview/PrvText.txt', `${S.org} 개인정보 처리방침 점검 보고서`]
    ], 'application/hwp+zip');
  }

  const fname = (ext) => `${String(S.org).replace(/[\\/:*?"<>|\s]+/g, '_')}_개인정보처리방침_점검보고서.${ext}`;
  function save(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  S.exportReport = (kind) => {
    try {
      const B = reportModel();
      if (kind === 'docx') save(docx(B), fname('docx'));
      else if (kind === 'hwpx') save(hwpx(B), fname('hwpx'));
    } catch (e) { console.warn('[내보내기]', e && e.message); alert('파일 생성 중 오류가 발생했습니다. PDF로 내려받아 주세요.'); }
  };
  S._exportInternals = { reportModel, docx, hwpx };
})();
