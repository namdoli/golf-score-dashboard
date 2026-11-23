# 골프 대시보드 — 배포 완료

**최종 업데이트:** 2026-11-23 13:42 (KST)

- 저장소: https://github.com/namdoli/golf-score-dashboard (public, `main`)
- 라이브: https://namdoli.github.io/golf-score-dashboard/ (GitHub Pages, `main` / `/ (root)`, 상태 `built`)
- 최종 커밋: `532d147` — 스코어카드 폭 정리

## 배포 과정에서 있었던 일
1. Pickle GitHub App에 저장소 생성 권한이 없어 `gh repo create`가 403 → 사용자가 `namdoli/golf-score-dashboard` public 저장소를 직접 생성.
2. Pages API도 403(앱에 Pages 권한 없음) → 사용자가 Settings > Pages에서 `main` / `(root)` 저장 후 빌드 완료.
3. 이후 코드 수정은 `git push origin main` 만으로 자동 반영(GitHub Pages legacy 빌드).

## 검증 기록 (2026-11-23 13:39–13:41, 라이브 URL 기준)
- Chart.js 차트 6개(trend/year/par/dist/half/goal) 모두 인스턴스 생성
- Leaflet 1.9.4, 마커 42개, 타일 15/15 로드, 팝업(골프장명·지역·방문횟수·평균/베스트·최근방문·라운드목록) 정상
- 연도 필터 클릭 → 35라운드/21곳/92.6타로 전 섹션 갱신
- 66라운드 표, 검색·정렬, 행 클릭 시 18홀 스코어카드(전반 40/후반 41) 펼침 확인
- 실패 리소스: 없음(favicon 추가로 404 해소)

## 데이터
66라운드 · 1,188홀 · 42개 골프장(전부 카카오맵 실좌표) · 평균 95.1타 · 베스트 81타 · 핸디캡 17.7
