# 골프 대시보드 — 배포 완료

**최종 업데이트:** 2026-11-23 13:55 (KST)

- 저장소: https://github.com/namdoli/golf-score-dashboard (public, `main`)
- 라이브: https://namdoli.github.io/golf-score-dashboard/ (GitHub Pages, `main` / `/ (root)`, 상태 `built`)
- 최종 커밋: `113a000` — 지도를 연회색 미니멀 톤(Esri Light Gray)으로 교체

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

## 지도 스타일 변경 (2026-11-23 13:47–13:55)
- **CARTO Positron 사용 불가**: `basemaps.cartocdn.com/light_all/...`는 200을 주지만 실제로는 4종 도메인·레거시 fastly 엔드포인트 모두 `API KEY REQUIRED` 자리표시 타일(2,049B, md5 동일)을 반환 → API 키 없는 운영 사용 불가.
- **Esri World Light Gray Base + Reference**로 교체: 두 서비스 모두 Referer 있는 요청에서 200/image로 정상 응답. 베이스는 수계·도로만 남은 연회색, Reference는 확대 시 지명·도로명을 은은하게 얹음.
- Esri Light Gray의 한국 데이터는 **z13까지** 제공(z14 이상은 `Map data not yet available` 타일) → `maxNativeZoom: 13`, `maxZoom: 13`으로 제한. 초기 뷰 z7.
- CSS: `.leaflet-tile-pane{filter:saturate(.6)}`로 공원 녹색까지 눌러 회색 통일, 라벨 레이어 `opacity:.85`, 에메랄드 핀은 흰 링 2.4px + `drop-shadow`로 대비 강화(1회 #10b981 → 4회+ #065f46), 줌 컨트롤·attribution을 카드 톤에 맞게 스타일링.
- 출처 표기: `Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors` (Esri 요구 사항).

## 지도 검증 (2026-11-23 13:50–13:54, 라이브 URL)
- 타일 30/30 로드, 실패·4xx/5xx 0건, 콘솔 에러 0건(렌더·타일 리스너로 확인)
- 마커 42개, 차트 6개, 라운드 표 66행 정상 · 연도 필터(2026=35라운드/21곳/92.6타, 2023=1라운드) 지도·전 섹션 갱신 확인
- 스크린샷: `golf/preview_map_desktop.png`, `golf/preview_map_mobile.png`, `golf/preview_map_detail.png`
- 남은 특성: 지명 라벨은 로마자(Seoul, Chuncheon)이고, 농촌 지역은 z12–13에서 라벨이 드물며 한강 하구 같은 곳은 확대 시 배경이 비어 보임.

## 데이터
66라운드 · 1,188홀 · 42개 골프장(전부 카카오맵 실좌표) · 평균 95.1타 · 베스트 81타 · 핸디캡 17.7
