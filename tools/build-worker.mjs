// Cloudflare Worker 배포 파일(worker/worker.js)을 만듭니다.
// rules.js(점검 규칙) + engine.js(점검 엔진) + worker-src.js(API·MCP 서버)를 하나로 합칩니다.
// 사용: node tools/build-worker.mjs   (GitHub Actions가 rules.js 변경 시 자동 실행)
import { readFileSync, writeFileSync } from 'node:fs';
import './check-node.mjs'; // 취약한 Node.js 버전이면 빌드 중단(KrCERT 2026.10.23. 권고)
const r = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const out = [
  '// ⚠ 자동 생성 파일입니다. 고칠 때는 worker/worker-src.js, assets/rules.js, assets/engine.js 를 고친 뒤 다시 빌드하세요.',
  'globalThis.window = globalThis;',
  r('assets/rules.js'), r('assets/engine.js'), r('worker/worker-src.js')
].join('\n');
writeFileSync(new URL('../worker/worker.js', import.meta.url), out);
console.log('worker/worker.js 생성 완료 (' + out.length + '자)');
