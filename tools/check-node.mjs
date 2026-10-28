// Node.js 보안 업데이트 권고(KrCERT/CC, 2026.10.23.) — CVE-2026-105482, CVE-2026-105483, CVE-2026-106069
// 영향: 22.23.4 / 24.22.1 / 26.12.1 미만 → 각 계열의 패치 버전 이상만 허용합니다.
// (CVE-2026-105483은 24·26 계열 대상이므로, 이 프로젝트는 24.22.1 이상 또는 26.12.1 이상을 권장)
const MIN = { 22: [22, 23, 4], 24: [24, 22, 1], 26: [26, 12, 1] };
const v = process.versions.node.split('.').map(Number);
const ge = (a, b) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];
const min = MIN[v[0]];
const ok = v[0] > 26 ? true : min ? ge(v, min) : false;
if (!ok) {
  console.error(`✖ Node.js ${process.versions.node}는 보안 권고 대상입니다. 24.22.1 이상(또는 26.12.1 이상)으로 올리세요.`);
  process.exit(1);
}
console.log(`✔ Node.js ${process.versions.node} — 보안 권고 패치 버전`);
