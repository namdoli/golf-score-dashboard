# 골프 대시보드 — 배포 대기 상태

**작성:** 2026-11-23 13:45 (KST)

## 현재 상태
- 대시보드 제작·데이터 검증 완료: `golf/dashboard/`
- 로컬 git 저장소 초기화 및 커밋 완료 (`main`, 커밋 `904e44b`)
- 원격 `origin` = `https://github.com/namdoli/golf-score-dashboard.git` (아직 저장소 없음)
- **막힌 지점:** Pickle GitHub App에 저장소 생성 권한(Administration)이 없어 `gh repo create`/`POST user/repos`가 403.
  사용자가 실수로 생성 완료 버튼을 눌렀고, 실제로는 저장소가 만들어지지 않음(2026-11-23 13:45 확인: `public_repos: 0`, API 404).

## 남은 작업 (저장소가 생기면 즉시)
```bash
cd golf/dashboard
git push -u origin main
gh api -X POST repos/namdoli/golf-score-dashboard/pages \
  -f "source[branch]=main" -f "source[path]=/"
gh api repos/namdoli/golf-score-dashboard/pages --jq '.status,.html_url'   # built 확인
```
그다음 `https://namdoli.github.io/golf-score-dashboard/` 를 브라우저로 열어 콘솔 오류·차트·지도·스코어카드 렌더링을 확인하고 데스크톱/모바일 스크린샷을 남긴다.

Pages 활성화가 403이면 코드는 푸시된 상태이므로 사용자가
`https://github.com/namdoli/golf-score-dashboard/settings/pages` 에서 Branch `main` / `/ (root)` 만 선택하면 된다.

## 사용자가 할 일
1. https://github.com/new → Repository name `golf-score-dashboard`, **Public**, README/라이선스 없이 생성
2. Pickle의 GitHub 저장소 접근에 이 저장소가 포함되는지 확인
(또는 https://github.com/apps/pickle/installations/new 에서 Administration·Pages 쓰기 권한 승인)

## 데이터 요약
66라운드 · 1,188홀 · 42개 골프장(전부 실좌표 지오코딩) · 평균 95.1타 · 베스트 81타 · 핸디캡 17.7
