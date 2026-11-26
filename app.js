/* ⛳ 골프 스코어 대시보드 — app.js */
(function () {
  'use strict';

  const COLORS = {
    emerald: '#059669', emeraldLight: '#34d399', emeraldDark: '#065f46',
    sky: '#0ea5e9', amber: '#f59e0b', rose: '#f43f5e', slate: '#64748b',
    slateLight: '#94a3b8', ink: '#0f172a'
  };

  const state = {
    year: 'all', search: '', sortKey: 'date', sortDir: 'desc', openId: null, photo: null, video: null,
    yrd: { course: 'SUN', hole: 1, doc: null, loading: false, path: null }
  };
  let DATA = null, ROUNDS = [], COURSES = [], UPCOMING = [], map = null, markers = [];
  const charts = {};

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const fmt1 = n => (Math.round(n * 10) / 10).toFixed(1);
  const fmtSign = n => (n > 0 ? '+' + n : String(n));
  function deepMerge(target, src) {
    Object.keys(src || {}).forEach(k => {
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Function)) {
        target[k] = deepMerge(target[k] && typeof target[k] === 'object' ? target[k] : {}, v);
      } else {
        target[k] = v;
      }
    });
    return target;
  }

  /* ---------- utilities ---------- */
  const byDate = (a, b) => (a.date === b.date ? (a.teeTime || '').localeCompare(b.teeTime || '') : a.date.localeCompare(b.date));
  const dateKo = d => {
    const [y, m, dd] = d.split('-');
    return `${y}.${m}.${dd}`;
  };
  const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
  function weekdayKo(d) {
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt.getTime()) ? '' : WEEK_KO[dt.getDay()];
  }
  const median = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const mean = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  // 스코어 미입력(null) 라운드는 통계에서 제외 — 0/NaN이 섞이지 않도록
  const hasScore = r => r && r.total !== null && r.total !== undefined && Number.isFinite(Number(r.total));
  const scored = list => list.filter(hasScore);
  const NO_PLACE = '장소 미기재 (캘린더)';
  function fmtDur(sec) {
    const s = Math.round(sec || 0);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const fmtMB = b => (b / 1048576).toFixed(1) + 'MB';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function filteredRounds() {
    return state.year === 'all' ? ROUNDS : ROUNDS.filter(r => r.year === Number(state.year));
  }

  function courseForKey(k) {
    return COURSES.find(c => c.key === k);
  }

  function courseLabel(r, sep) {
    const names = (r.courses || []).filter(c => c && String(c).trim());
    return names.length ? names.join(sep || ' · ') : '코스 정보 없음';
  }

  function statForCourses(rounds) {
    const m = new Map();
    rounds.forEach(r => {
      const c = m.get(r.club) || { rounds: [] };
      c.rounds.push(r);
      m.set(r.club, c);
    });
    return m;
  }

  /* ---------- init ---------- */
  function boot() {
    Promise.all([
      fetch('data/scores.json', { cache: 'no-store' }).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }),
      // 예정 라운드는 완료 통계와 분리된 파일에서 읽는다 (없어도 대시보드는 정상 동작)
      fetch('data/upcoming.json', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { rounds: [] }))
        .catch(() => ({ rounds: [] }))
    ])
      .then(([doc, upcoming]) => {
        DATA = doc;
        DATA.upcoming = (upcoming && upcoming.rounds) || [];
        UPCOMING = DATA.upcoming;
        ROUNDS = doc.rounds.slice().sort(byDate);
        COURSES = doc.courses;
        ROUNDS.forEach(r => {
          r.front = r.front || {};
          r.back = r.back || {};
          r.frontScore = r.front.score;
          r.backScore = r.back.score;
          r.clubShort = (courseForKey(r.club) || {}).name || r.club;
          r.region = (courseForKey(r.club) || {}).region || '';
        });
        hydrateHeader();
        buildFilters();
        initStickyBar();
        renderAll();
        $('#loading').classList.add('hide');
        setTimeout(() => { $('#loading').style.display = 'none'; }, 380);
      })
      .catch(err => {
        console.error('데이터 로딩 실패', err);
        $('#loading').style.display = 'none';
        $('#loadError').hidden = false;
      });
  }

  function hydrateHeader() {
    const m = DATA.meta;
    $('#heroSub').textContent =
      `${dateKo(m.period.from)} – ${dateKo(m.period.to)} · ${m.counts.rounds}라운드`;
    $('#heroBadges').innerHTML = [
      `<span class="hbadge">핸디캡 <b>${m.handicap.index}</b></span>`,
      `<span class="hbadge">베스트 <b>${m.best}타</b></span>`,
      `<span class="hbadge">평균 <b>${m.avg}타</b></span>`
    ].join('');
    const yc = {};
    ROUNDS.forEach(r => { yc[r.year] = (yc[r.year] || 0) + 1; });
    state.yearCounts = yc;
  }

  /* ---------- filters ---------- */
  function buildFilters() {
    const years = [...new Set(ROUNDS.map(r => r.year))].sort((a, b) => b - a);
    const pills = [`<button class="pill ${state.year === 'all' ? 'active' : ''}" data-year="all">전체</button>`]
      .concat(years.map(y => {
        const n = state.yearCounts[y] || 0;
        return `<button class="pill ${String(state.year) === String(y) ? 'active' : ''}" data-year="${y}">${y}<span style="opacity:.55;font-weight:500;margin-left:4px">${n}</span></button>`;
      }));
    $('#yearPills').innerHTML = pills.join('');
    $$('#yearPills .pill').forEach(b => b.addEventListener('click', () => {
      state.year = b.dataset.year;
      state.openId = null;
      $$('#yearPills .pill').forEach(x => x.classList.toggle('active', x === b));
      renderAll();
    }));
    updateHint();
  }

  function updateHint() {
    const n = filteredRounds().length;
    const label = state.year === 'all' ? '전체 기간' : state.year + '년';
    $('#filterHint').innerHTML = `<b>${label}</b> · ${n}라운드`;
  }

  /* ---------- STICKY SUMMARY (스크롤 고정 바) ---------- */
  function handicapForSelection(rated) {
    const m = DATA.meta.handicap;
    if (state.year === 'all') {
      return { text: m.index, note: `공식 핸디캡 인덱스 · ${m.asOf} 기준 (${m.club})` };
    }
    const last = rated.slice(-20);
    if (last.length < 3) {
      return { text: '–', note: '스코어가 3건 미만이어 추정하지 않습니다' };
    }
    const diffs = last.map(r => Number(r.total) - (Number(r.par) || 72)).sort((a, b) => a - b);
    const take = Math.max(1, Math.min(8, Math.round(diffs.length * 0.4)));
    return {
      text: '≈' + fmt1(mean(diffs.slice(0, take))),
      note: `그 해 스코어 기준 추정 (최근 ${last.length}라운드 중 베스트 ${take}개의 파 대비 평균) · 공식 인덱스 ${m.index} (${m.asOf})`
    };
  }

  function renderStickySummary(rounds) {
    const rated = scored(rounds);
    const scores = rated.map(r => Number(r.total));
    const handi = handicapForSelection(rated);
    const avgEl = $('#sbAvg'), bestEl = $('#sbBest'), handiEl = $('#sbHandi');
    if (avgEl) avgEl.textContent = scores.length ? fmt1(mean(scores)) : '–';
    if (bestEl) bestEl.textContent = scores.length ? Math.min(...scores) : '–';
    if (handiEl) handiEl.textContent = handi.text;
    const wrap = $('#sbHandiWrap');
    if (wrap) wrap.title = handi.note;
    const bar = $('#stickyBar');
    if (bar) bar.setAttribute('aria-label', `남돌군의 골프 스코어 · 평균 ${scores.length ? fmt1(mean(scores)) + '타' : '–'} · 베스트 ${scores.length ? Math.min(...scores) + '타' : '–'} · 핸디캡 ${handi.text}`);
  }

  function initStickyBar() {
    const bar = $('#stickyBar');
    if (!bar) return;
    let raf = 0, stuck = false;
    const sync = () => {
      raf = 0;
      const next = bar.getBoundingClientRect().top <= 1;
      if (next === stuck) return;
      stuck = next;
      bar.classList.toggle('stuck', stuck);
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(sync); };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    sync();
  }

  /* ---------- render orchestration ---------- */
  function renderAll() {
    updateHint();
    const rounds = filteredRounds();
    renderStickySummary(rounds);
    renderKpis(rounds);
    renderMap(rounds);
    renderTrend(rounds);
    renderPar(rounds);
    renderDistribution(rounds);
    renderHalf(rounds);
    renderGoals(rounds);
    renderHeatmap(rounds);
    renderTable(rounds);
  }

  /* ---------- SWING VIDEO ---------- */
  /* 한 라운드에 스윙 영상이 여러 개일 수 있다: swingVideos 배열, 예전 데이터의 swingVideo 단일 객체도 호환 */
  function roundVideos(r) {
    if (!r) return [];
    if (Array.isArray(r.swingVideos)) return r.swingVideos.filter(Boolean);
    return r.swingVideo ? [r.swingVideo] : [];
  }

  function openVideo(roundId, idx) {
    const r = ROUNDS.find(x => x.id === roundId);
    const list = roundVideos(r);
    if (!list.length) return;
    state.video = { roundId, idx: Math.max(0, Math.min(Number(idx) || 0, list.length - 1)) };
    renderVideoModal();
    $('#videoModal').hidden = false;
    document.body.classList.add('modal-open');
    $('#vmClose').focus();
  }

  function renderVideoModal() {
    const s = state.video;
    if (!s) return;
    const r = ROUNDS.find(x => x.id === s.roundId);
    const list = roundVideos(r);
    if (!r || !list.length) return;
    s.idx = Math.max(0, Math.min(s.idx, list.length - 1));
    const v = list[s.idx], multi = list.length > 1, vid = $('#vmVideo');
    $('#vmTitle').textContent = multi ? `${r.clubShort} · 스윙 영상 ${s.idx + 1}/${list.length}` : `${r.clubShort} · ${v.title}`;
    $('#vmSub').textContent = `${dateKo(r.date)}${r.teeTime ? ' ' + r.teeTime + ' 티오프' : ''} · ${hasScore(r) ? `${r.total}타 (파 ${r.par}, ${fmtSign(r.toPar)})` : '스코어 미입력'} · ${v.note}`;
    $('#vmFoot').innerHTML = `<span>${courseLabel(r)} · ${fmtDur(v.durationSec)} · ${fmtMB(v.bytes)}</span>` +
      `<a href="${v.src}" target="_blank" rel="noopener">원본 열기 ↗</a>`;
    const tabs = $('#vmTabs');
    if (tabs) {
      tabs.hidden = !multi;
      tabs.innerHTML = multi ? `<span class="vm-tabs-lbl">영상 선택</span>` + list.map((x, i) =>
        `<button class="vm-tab${i === s.idx ? ' active' : ''}" type="button" data-vmtab="${i}" aria-pressed="${i === s.idx ? 'true' : 'false'}">영상 ${i + 1}<small>${fmtDur(x.durationSec)}</small></button>`
      ).join('') : '';
    }
    vid.poster = v.poster;
    vid.src = v.src;
    vid.load();
    const p = vid.play();
    if (p && p.catch) p.catch(() => {});
  }

  function closeVideo() {
    const modal = $('#videoModal'), vid = $('#vmVideo');
    if (!modal || modal.hidden) return;
    try { vid.pause(); } catch (e) {}
    vid.removeAttribute('src');
    vid.load();
    modal.hidden = true;
    state.video = null;
    const tabs = $('#vmTabs');
    if (tabs) { tabs.hidden = true; tabs.innerHTML = ''; }
    if ($('#photoModal').hidden) document.body.classList.remove('modal-open');
  }

  /* ---------- ROUND PHOTOS ---------- */
  function roundPhotos(r) {
    return r && Array.isArray(r.photos) ? r.photos.filter(Boolean) : [];
  }

  function photoMeta(r) {
    return `${dateKo(r.date)}${r.teeTime ? ' ' + r.teeTime + ' 티오프' : ''} · ${hasScore(r)
      ? `${r.total}타 (파 ${r.par}, ${fmtSign(r.toPar)})`
      : '스코어 미입력'}`;
  }

  function renderPhotoModal() {
    const p = state.photo;
    if (!p) return;
    const r = ROUNDS.find(x => x.id === p.roundId);
    if (!r) return;
    const list = roundPhotos(r);
    if (!list.length) return;
    const idx = Math.max(0, Math.min(p.idx, list.length - 1));
    p.idx = idx;
    const img = $('#pmImg');
    img.src = list[idx];
    img.alt = `${r.clubShort} 라운드 사진 ${idx + 1}`;
    $('#pmTitle').textContent = `${r.clubShort} · 라운드 사진`;
    $('#pmSub').textContent = photoMeta(r);
    const course = courseLabel(r);
    $('#pmFoot').innerHTML = `<span>${idx + 1} / ${list.length}장${course !== '코스 정보 없음' ? ' · ' + course : ''}</span>` +
      `<a href="${list[idx]}" target="_blank" rel="noopener">원본 열기 ↗</a>`;
    const multi = list.length > 1;
    $('#pmPrev').hidden = !multi;
    $('#pmNext').hidden = !multi;
  }

  function openPhoto(roundId, idx) {
    const r = ROUNDS.find(x => x.id === roundId);
    if (!r || !roundPhotos(r).length) return;
    state.photo = { roundId, idx: Number(idx) || 0 };
    renderPhotoModal();
    $('#photoModal').hidden = false;
    document.body.classList.add('modal-open');
    $('#pmClose').focus();
  }

  function stepPhoto(delta) {
    if (!state.photo) return;
    const r = ROUNDS.find(x => x.id === state.photo.roundId);
    const n = roundPhotos(r).length;
    if (n < 2) return;
    state.photo.idx = (state.photo.idx + delta + n) % n;
    renderPhotoModal();
  }

  function closePhoto() {
    const modal = $('#photoModal');
    if (!modal || modal.hidden) return;
    const img = $('#pmImg');
    img.removeAttribute('src');
    modal.hidden = true;
    state.photo = null;
    if ($('#videoModal').hidden) document.body.classList.remove('modal-open');
  }

  /* ---------- KPI ---------- */
  function renderKpis(rounds) {
    const rated = scored(rounds);
    const pending = rounds.length - rated.length;
    const scores = rated.map(r => r.total);
    const uniq = new Set(rounds.filter(r => r.club !== NO_PLACE).map(r => r.club)).size;
    const totalCourses = COURSES.length;
    const bestRound = rated.slice().sort((a, b) => a.total - b.total)[0];
    const m = DATA.meta;
    const avg = scores.length ? mean(scores) : 0;

    const cards = [
      {
        label: '총 라운드', icon: '🏌️', value: rounds.length, unit: '회',
        foot: `스코어 <b>${rated.length}</b>건${pending ? ` · 미입력 <b>${pending}</b>건` : ''}`
      },
      {
        label: '방문 골프장', icon: '📍', value: uniq, unit: '곳',
        foot: `전체 ${totalCourses}곳 중 ${totalCourses ? Math.round(uniq / totalCourses * 100) : 0}%`
      },
      {
        label: '평균 타수', icon: '📊', value: avg ? fmt1(avg) : '–', unit: '타',
        foot: `중앙값 <b>${scores.length ? median(scores) : '–'}</b>타 · 스코어 ${rated.length}건 기준`
      },
      {
        label: '베스트 스코어', icon: '🏆', cls: 'k-accent',
        value: bestRound ? bestRound.total : '–', unit: '타',
        foot: bestRound ? `${bestRound.clubShort} · ${dateKo(bestRound.date)}` : '기록 없음'
      },
      {
        label: '핸디캡 인덱스', icon: '⛳', cls: 'k-sky',
        value: m.handicap.index, unit: '',
        foot: `${m.handicap.asOf} 기준 · ${m.handicap.club}`
      }
    ];

    $('#kpiGrid').innerHTML = cards.map(c => `
      <div class="kpi ${c.cls || ''}">
        <div class="label"><span class="lico" aria-hidden="true">${c.icon}</span>${c.label}</div>
        <div class="value">${c.value}${c.unit ? `<small>${c.unit}</small>` : ''}</div>
        <div class="foot">${c.foot}</div>
      </div>`).join('');
  }

  /* ---------- MAP ---------- */
  function markerColor(v) {
    if (v >= 4) return '#065f46';
    if (v === 3) return '#047857';
    if (v === 2) return '#059669';
    return '#10b981';
  }

  function renderMap(rounds) {
    if (typeof L === 'undefined') {
      $('#map').innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#94a3b8;font-size:13px">지도를 불러오지 못했습니다.</div>';
      return;
    }
    if (!map) {
      map = L.map('map', { scrollWheelZoom: false, zoomControl: true, minZoom: 6, maxZoom: 13 }).setView([37.5, 127.6], 7);
      // 연회색 미니멀 베이스(Esri Light Gray) — 수계·도로만 남긴 저채도 톤
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> — Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
        maxNativeZoom: 13, maxZoom: 13
      }).addTo(map);
      // 확대 시 도로·지명만 은은하게 얹는 라벨 레이어
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 13, maxZoom: 13, className: 'ref-tiles'
      }).addTo(map);
      map.on('click', () => map.closePopup());
    }
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    map.closePopup();

    const per = statForCourses(rounds);
    const list = [];
    per.forEach((v, k) => { if (courseForKey(k)) list.push({ key: k, ...v }); });
    const domestic = [];
    let jpMarker = null, jpVisits = 0;

    list.forEach(({ key, rounds: rs }) => {
      const g = courseForKey(key);
      if (!g) return;
      const ratedRs = scored(rs);
      const scores = ratedRs.map(r => r.total);
      const avg = scores.length ? mean(scores) : null;
      const best = scores.length ? Math.min(...scores) : null;
      const last = rs.map(r => r.date).sort().slice(-1)[0];
      const visits = rs.length;
      const radius = 6 + Math.min(visits, 5) * 2.4;

      const mk = L.circleMarker([g.lat, g.lng], {
        radius, color: '#ffffff', weight: 2.4, opacity: 1,
        fillColor: markerColor(visits), fillOpacity: 0.95
      }).addTo(map);

      const roundRows = rs.slice().sort(byDate).reverse().map(r =>
        `<div class="pc-round"><span>${dateKo(r.date)} <em>${courseLabel(r, '·')}</em></span><b>${hasScore(r) ? r.total : '<span style="color:#94a3b8;font-weight:600">미입력</span>'}</b></div>`
      ).join('');

      mk.bindPopup(`
        <div class="pc-title">${g.name}</div>
        <div class="pc-region">${g.region} · ${g.address}</div>
        <div class="pc-stats">
          <div class="pc-stat">방문 <b>${visits}회</b></div>
          <div class="pc-stat">평균 <b>${avg !== null ? fmt1(avg) + '타' : '–'}</b></div>
          <div class="pc-stat">베스트 <b>${best !== null ? best + '타' : '–'}</b></div>
          <div class="pc-stat">최근 <b>${dateKo(last)}</b></div>
        </div>
        ${!scores.length ? '<div class="pc-note">스코어 미입력 라운드입니다.</div>' : ''}
        <div class="pc-rounds">${roundRows}</div>
        ${g.mapsUrl ? `<a class="pc-link" href="${g.mapsUrl}" target="_blank" rel="noopener">${/google/i.test(g.mapsUrl) ? '구글맵에서 보기' : '카카오맵에서 보기'} →</a>` : ''}
      `, { maxWidth: 280, closeButton: true });

      mk.on('mouseover', () => mk.openPopup());
      mk.on('click', () => mk.openPopup());
      mk._visits = visits;
      if (g.country === 'JP') { jpMarker = mk; jpVisits = visits; }
      else domestic.push(mk);
      markers.push(mk);
    });

    // 초기 뷰는 국내 골프장 기준 — 해외(홋카이도)는 칩으로 이동
    const focus = domestic.length ? domestic : markers;
    if (focus.length) {
      const group = L.featureGroup(focus);
      map.fitBounds(group.getBounds().pad(0.14));
    }

    $('#mapSub').textContent = `방문한 골프장 ${list.length}곳 — 마커 크기·색은 방문 횟수${jpMarker ? ' (해외 1곳 포함)' : ''}`;
    const top = list.slice().sort((a, b) => b.rounds.length - a.rounds.length)[0];
    const regions = {};
    list.forEach(({ key }) => {
      const g = courseForKey(key);
      if (g) regions[g.region] = (regions[g.region] || 0) + 1;
    });
    const regionTop = Object.entries(regions).sort((a, b) => b[1] - a[1]).slice(0, 4);
    $('#mapFoot').innerHTML = [
      `<span class="chip">지도 위 <b>${list.length}곳</b></span>`,
      domestic.length ? `<button class="chip chip-btn" type="button" id="krChip">🇰🇷 국내 <b>${domestic.length}곳</b></button>` : '',
      jpMarker ? `<button class="chip chip-btn jp" type="button" id="jpChip">🇯🇵 홋카이도 루스쓰 <b>${jpVisits}회</b> →</button>` : '',
      top ? `<span class="chip">최다 방문 <b>${(courseForKey(top.key) || {}).name || top.key}</b> ${top.rounds.length}회</span>` : '',
      ...regionTop.map(([r, n]) => `<span class="chip">${r} <b>${n}</b></span>`)
    ].join('');

    const krChip = document.getElementById('krChip');
    if (krChip && domestic.length) krChip.addEventListener('click', () => {
      map.closePopup();
      map.fitBounds(L.featureGroup(domestic).getBounds().pad(0.14));
    });
    const jpChip = document.getElementById('jpChip');
    if (jpChip && jpMarker) jpChip.addEventListener('click', () => {
      map.setView(jpMarker.getLatLng(), 11, { animate: true });
      jpMarker.openPopup();
    });
  }

  /* ---------- TREND ---------- */
  function movingAvg(arr, w) {
    return arr.map((_, i) => mean(arr.slice(Math.max(0, i - w + 1), i + 1)));
  }

  function renderTrend(rounds) {
    const all = scored(ROUNDS);
    const scores = all.map(r => r.total);
    const ma10 = movingAvg(scores, 10);
    const bandMax = scores.map((_, i) => Math.max(...scores.slice(Math.max(0, i - 4), i + 1)));
    const bandMin = scores.map((_, i) => Math.min(...scores.slice(Math.max(0, i - 4), i + 1)));

    const idx = all.map((r, i) => ({ r, i })).filter(({ r }) => state.year === 'all' || r.year === Number(state.year));
    const labels = idx.map(({ r }) => `${r.date.slice(5)} ${r.clubShort}`);
    const pick = f => idx.map(({ i }) => f(i));

    // 선형 추세선 (라운드당 타수 변화) — 이동평균선과 함께 성장 흐름 표시
    let fit = null;
    if (scores.length > 1) {
      const xs = scores.map((_, i) => i);
      const mx = mean(xs), my = mean(scores);
      let num = 0, den = 0;
      xs.forEach((x, i) => { num += (x - mx) * (scores[i] - my); den += (x - mx) * (x - mx); });
      const slope = den ? num / den : 0;
      fit = { slope, intercept: my - slope * mx };
    }

    const ds = [
      {
        label: '5라운드 밴드(최저)', data: pick(i => bandMin[i]),
        borderColor: 'rgba(16,185,129,0)', backgroundColor: 'rgba(16,185,129,.12)',
        pointRadius: 0, borderWidth: 0, fill: false, tension: 0
      },
      {
        label: '5라운드 밴드(최고)', data: pick(i => bandMax[i]),
        borderColor: 'rgba(16,185,129,0)', backgroundColor: 'rgba(16,185,129,.12)',
        pointRadius: 0, borderWidth: 0, fill: '-1', tension: 0
      },
      {
        label: '라운드 스코어', data: pick(i => scores[i]),
        borderColor: 'rgba(148,163,184,.85)', backgroundColor: 'rgba(148,163,184,.85)',
        borderWidth: 1.6, pointRadius: 2.6, pointHoverRadius: 4, tension: .25
      },
      {
        label: '10라운드 이동평균', data: pick(i => ma10[i]),
        borderColor: COLORS.sky, backgroundColor: COLORS.sky,
        borderWidth: 2.4, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 4, tension: .35, fill: false
      }
    ];
    if (fit) {
      ds.push({
        label: '성장 추세선', data: pick(i => fit.intercept + fit.slope * i),
        borderColor: COLORS.amber, backgroundColor: COLORS.amber,
        borderWidth: 2.2, borderDash: [2, 3], pointRadius: 0, pointHoverRadius: 0, tension: 0, fill: false
      });
    }

    drawChart('trendChart', {
      type: 'line',
      data: { labels, datasets: ds },
      options: baseOptions({
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 14, boxHeight: 2, font: { size: 11 }, padding: 10, usePointStyle: false, filter: it => !it.text.includes('밴드') } },
          tooltip: {
            callbacks: {
              title: items => items.length ? idx[items[0].dataIndex].r.clubShort + ' · ' + dateKo(idx[items[0].dataIndex].r.date) : '',
              label: c => {
                if (c.dataset.label.includes('밴드')) return null;
                return `${c.dataset.label}: ${fmt1(c.parsed.y)}타`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10, font: { size: 10 } }, grid: { display: false } },
          y: { title: { display: true, text: '타수', font: { size: 10.5 } }, grid: { color: 'rgba(226,232,240,.9)' } }
        }
      })
    });

    // year comparison
    const yc = {};
    scored(ROUNDS).forEach(r => {
      if (!yc[r.year]) yc[r.year] = [];
      yc[r.year].push(r.total);
    });
    const years = Object.keys(yc).map(Number).sort();
    if (!years.length) {
      $('#trendInsights').innerHTML = '<div class="insight"><span class="ic">📝</span><span>이 기간에는 스코어가 기록된 라운드가 없습니다.</span></div>';
      return;
    }
    const avgByYear = years.map(y => mean(yc[y]));
    const counts = years.map(y => yc[y].length);
    const avgMin = Math.min(...avgByYear), avgMax = Math.max(...avgByYear);
    const isOn = y => state.year === 'all' || state.year === String(y);
    drawChart('yearChart', {
      type: 'bar',
      data: {
        labels: years.map(y => `${y}년`),
        datasets: [
          {
            label: '라운딩 횟수', data: counts, yAxisID: 'y',
            backgroundColor: years.map(y => isOn(y) ? 'rgba(251,146,60,.42)' : 'rgba(251,146,60,.15)'),
            borderColor: years.map(y => isOn(y) ? '#fb923c' : 'rgba(251,146,60,.55)'),
            borderWidth: 1.5, borderRadius: 8, borderSkipped: false, maxBarThickness: 52,
            pointStyle: 'rectRounded', order: 2
          },
          {
            label: '연도 평균 타수', data: avgByYear.map(v => Math.round(v * 10) / 10),
            type: 'line', yAxisID: 'y1',
            borderColor: COLORS.emerald, backgroundColor: COLORS.emerald,
            borderWidth: 3, pointRadius: 4.5, pointHoverRadius: 6,
            pointBackgroundColor: COLORS.emerald, pointBorderColor: '#fff', pointBorderWidth: 2,
            pointStyle: 'circle', tension: .3, order: 0
          }
        ]
      },
      options: baseOptions({
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 }, padding: 10, usePointStyle: true } },
          tooltip: { callbacks: {
            label: c => c.dataset.type === 'line' ? `평균 ${fmt1(c.parsed.y)}타` : `${c.parsed.y}라운드`
          } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            beginAtZero: true, suggestedMax: Math.max(...counts) + 4,
            title: { display: true, text: '라운딩 횟수', font: { size: 10 } },
            grid: { color: 'rgba(226,232,240,.9)' }, ticks: { precision: 0 }
          },
          y1: {
            position: 'right', beginAtZero: false,
            suggestedMin: Math.floor(avgMin - 3), suggestedMax: Math.ceil(avgMax + 3),
            title: { display: true, text: '평균 타수', font: { size: 10 } },
            grid: { display: false }
          }
        }
      })
    });

    // insights — 성장 추이 중심
    const firstY = years[0], lastY = years[years.length - 1];
    const imp = avgByYear[0] - avgByYear[avgByYear.length - 1];
    const recent = scores.slice(-10), prev = scores.slice(-20, -10);
    const delta = prev.length ? mean(prev) - mean(recent) : 0;
    const slopeTxt = fit ? `${fit.slope < 0 ? '라운드당 평균 ' + fmt1(Math.abs(fit.slope)) + '타씩 좋아지는' : '라운드당 평균 ' + fmt1(Math.abs(fit.slope)) + '타씩 높아지는'} 흐름` : '';
    const bestR = scored(ROUNDS).slice().sort((a, b) => a.total - b.total)[0];
    const insights = [
      `<div class="insight"><span class="ic">🎯</span><span>${lastY}년 평균은 <b>${fmt1(avgByYear[avgByYear.length - 1])}타</b>, ${firstY}년(${fmt1(avgByYear[0])}타)보다 <b>${fmt1(Math.abs(imp))}타 ${imp >= 0 ? '좋아졌어요' : '높아졌어요'}</b>.</span></div>`,
      recent.length ? `<div class="insight"><span class="ic">📈</span><span>최근 10라운드 평균 <b>${fmt1(mean(recent))}타</b> — 그 이전 10라운드보다 <b>${fmt1(Math.abs(delta))}타 ${delta >= 0 ? '개선' : '상승'}</b>${slopeTxt ? `, ${slopeTxt}` : ''}.</span></div>` : '',
      bestR ? `<div class="insight"><span class="ic">🏆</span><span>베스트 라운드는 <b>${bestR.total}타</b> · ${bestR.clubShort} (${dateKo(bestR.date)}).</span></div>` : ''
    ];
    $('#trendInsights').innerHTML = insights.join('');
  }

  /* ---------- PAR ---------- */
  function renderPar(rounds) {
    const groups = { 3: [], 4: [], 5: [] };
    rounds.forEach(r => (r.holes || []).forEach(h => {
      if (groups[h.par]) groups[h.par].push(h);
    }));
    const stats = [3, 4, 5].map(p => {
      const hs = groups[p];
      const avg = hs.length ? mean(hs.map(h => h.stroke)) : 0;
      return { par: p, n: hs.length, avg, over: avg - p };
    });

    $('#parCards').innerHTML = stats.map(s => `
      <div class="par-card">
        <div class="t">Par ${s.par}</div>
        <div class="v">${s.n ? fmt1(s.avg) : '–'}<small>타</small></div>
        <div class="d ${s.over > 0 ? 'pos' : s.over < 0 ? 'neg' : 'neutral'}">${s.n ? fmtSign(fmt1(s.over)) + ' 오버' : '기록 없음'}</div>
        <div class="d neutral" style="font-weight:500">${s.n.toLocaleString()}홀</div>
      </div>`).join('');

    drawChart('parChart', {
      type: 'bar',
      data: {
        labels: ['Par 3', 'Par 4', 'Par 5'],
        datasets: [
          {
            label: '평균 타수', data: stats.map(s => Math.round(s.avg * 100) / 100),
            backgroundColor: ['rgba(52,211,153,.9)', 'rgba(5,150,105,.9)', 'rgba(6,95,70,.9)'],
            borderRadius: 9, maxBarThickness: 74
          },
          {
            label: '기준 파', data: [3, 4, 5], type: 'line',
            borderColor: COLORS.amber, borderWidth: 2, borderDash: [5, 4],
            pointRadius: 3, pointBackgroundColor: COLORS.amber, fill: false
          }
        ]
      },
      options: baseOptions({
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => c.dataset.label === '기준 파' ? `파 ${c.parsed.y}` : `평균 ${fmt1(c.parsed.y)}타 (${fmtSign(fmt1(stats[c.dataIndex].over))})`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11.5, weight: '600' } } },
          y: { suggestedMin: 2.4, suggestedMax: 6, grid: { color: 'rgba(226,232,240,.9)' }, ticks: { callback: v => v + '타' } }
        }
      })
    });
  }

  /* ---------- DISTRIBUTION ---------- */
  function renderDistribution(rounds) {
    const buckets = [
      { key: 'eagle', label: '이글 이상', color: '#065f46', test: t => t <= -2 },
      { key: 'birdie', label: '버디', color: '#10b981', test: t => t === -1 },
      { key: 'par', label: '파', color: '#0ea5e9', test: t => t === 0 },
      { key: 'bogey', label: '보기', color: '#f59e0b', test: t => t === 1 },
      { key: 'double', label: '더블보기', color: '#f43f5e', test: t => t === 2 },
      { key: 'triple', label: '트리플 이상', color: '#9f1239', test: t => t >= 3 }
    ];
    const holes = rounds.flatMap(r => r.holes || []);
    const total = holes.length;
    const counts = buckets.map(b => holes.filter(h => b.test(h.toPar)).length);
    const sum = counts.reduce((a, b) => a + b, 0) || 1;

    drawChart('distChart', {
      type: 'doughnut',
      data: {
        labels: buckets.map(b => b.label),
        datasets: [{
          data: counts,
          backgroundColor: buckets.map(b => b.color),
          borderColor: '#fff', borderWidth: 2, hoverOffset: 6
        }]
      },
      options: baseOptions({
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed}홀 (${fmt1(c.parsed / sum * 100)}%)` } }
        }
      })
    });

    $('#distSub').textContent = `전체 ${total.toLocaleString()}홀 결과 비율`;
    $('#distLegend').innerHTML = buckets.map((b, i) => `
      <div class="dl"><i style="background:${b.color}"></i>${b.label} <b>${fmt1(counts[i] / sum * 100)}%</b>
      <span style="color:var(--slate-400)">${counts[i]}</span></div>`).join('');
  }

  /* ---------- HALF ---------- */
  function renderHalf(rounds) {
    const valid = rounds.filter(r => r.frontScore && r.backScore);
    const f = mean(valid.map(r => r.frontScore));
    const b = mean(valid.map(r => r.backScore));
    const diff = b - f; // negative => back better
    const diffs = valid.map(r => r.backScore - r.frontScore);
    const betterBack = diffs.filter(d => d < 0).length;
    const betterFront = diffs.filter(d => d > 0).length;
    const same = diffs.filter(d => d === 0).length;

    $('#halfTop').innerHTML = `
      <div class="half-box"><div class="t">전반(OUT) 평균</div><div class="v">${valid.length ? fmt1(f) : '–'}<small>타</small></div></div>
      <div class="half-box"><div class="t">후반(IN) 평균</div><div class="v">${valid.length ? fmt1(b) : '–'}<small>타</small></div></div>
      <div class="half-box hl"><div class="t">후반 − 전반</div><div class="v ${diff < 0 ? 'neg' : diff > 0 ? 'pos' : ''}">${valid.length ? fmtSign(fmt1(diff)) : '–'}<small>타</small></div></div>
    `;

    let insight;
    if (!valid.length) insight = '이 기간에는 기록이 없습니다';
    else if (Math.abs(diff) < 0.5) insight = '전·후반 실력이 거의 같아요';
    else if (diff < 0) insight = `후반에 강해요 — 후반이 평균 ${fmt1(Math.abs(diff))}타 더 좋아요`;
    else insight = `전반에 강해요 — 전반이 평균 ${fmt1(Math.abs(diff))}타 더 좋아요`;
    $('#halfInsight').textContent = insight;

    drawChart('halfChart', {
      type: 'bar',
      data: {
        labels: valid.map(r => `${r.date.slice(2, 7)} ${r.clubShort}`),
        datasets: [{
          label: '후반 − 전반',
          data: diffs,
          backgroundColor: diffs.map(d => d < 0 ? 'rgba(16,185,129,.85)' : d > 0 ? 'rgba(244,63,94,.75)' : 'rgba(148,163,184,.8)'),
          borderRadius: 4, maxBarThickness: 18
        }]
      },
      options: baseOptions({
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: i => valid[i[0].dataIndex].clubShort + ' · ' + dateKo(valid[i[0].dataIndex].date),
              label: c => {
                const r = valid[c.dataIndex];
                return [`전반 ${r.frontScore} · 후반 ${r.backScore}`, `차이 ${fmtSign(c.parsed.y)}타 (${c.parsed.y < 0 ? '후반 우세' : c.parsed.y > 0 ? '전반 우세' : '동일'})`];
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { display: false } },
          y: { grid: { color: 'rgba(226,232,240,.9)' }, ticks: { callback: v => fmtSign(v) } }
        }
      })
    });

    const chip = document.createElement('div');
    chip.className = 'insight';
    chip.style.marginTop = '12px';
    chip.innerHTML = `<span class="ic">📌</span><span>후반이 더 좋았던 라운드 <b>${betterBack}회</b> · 전반이 더 좋았던 라운드 <b>${betterFront}회</b> · 동일 <b>${same}회</b></span>`;
    const wrap = $('#halfChart').parentElement;
    const old = wrap.parentElement.querySelector('.half-note');
    if (old) old.remove();
    chip.classList.add('half-note');
    wrap.after(chip);
  }

  /* ---------- GOALS ---------- */
  function longestStreak(rounds, pred) {
    let best = 0, cur = 0, bestEnd = null, curStart = 0;
    rounds.forEach((r, i) => {
      if (pred(r)) {
        if (cur === 0) curStart = i;
        cur++;
        if (cur > best) { best = cur; bestEnd = i; }
      } else cur = 0;
    });
    return { best, start: best > 0 ? rounds[bestEnd - best + 1] : null, end: best > 0 ? rounds[bestEnd] : null };
  }

  function renderGoals(rounds) {
    const rated = scored(rounds);
    const n = rated.length;
    const u90 = rated.filter(r => r.total < 90);
    const u80 = rated.filter(r => r.total < 80);
    const ndp = rated.filter(r => r.noDoublePar === true);
    const streak = longestStreak(rated, r => r.noDoublePar === true);
    const bestScore = n ? Math.min(...rated.map(r => r.total)) : null;

    const goals = [
      {
        title: '80대 진입', icon: '🎯', cls: '',
        big: `${u90.length}<small> / ${n}회</small>`,
        pct: n ? u90.length / n * 100 : 0,
        foot: `90타 미만 비율 ${n ? fmt1(u90.length / n * 100) : 0}% · 첫 달성 ${u90.length ? dateKo(u90.slice().sort(byDate)[0].date) : '–'}`
      },
      {
        title: '70대 도전', icon: '🔥', cls: 'g-amber',
        big: `${u80.length}<small> / ${n}회</small>`,
        pct: n ? u80.length / n * 100 : 0,
        foot: `80타 미만 ${u80.length}회 · 최저 ${bestScore !== null ? bestScore : '–'}타 (80타까지 ${bestScore !== null ? bestScore - 80 : '–'}타)`
      },
      {
        title: '노 더블 파', icon: '🛡️', cls: '',
        big: `${ndp.length}<small> / ${n}회</small>`,
        pct: n ? ndp.length / n * 100 : 0,
        foot: `최장 연속 ${streak.best}라운드${streak.end ? ` (${dateKo(streak.end.date)} 기준)` : ''}`
      }
    ];

    $('#goalGrid').innerHTML = goals.map(g => `
      <div class="goal ${g.cls}">
        <div class="gt"><span>${g.icon} ${g.title}</span><span style="color:var(--slate-400);font-size:12px">${fmt1(g.pct)}%</span></div>
        <div class="gn">${g.big}</div>
        <div class="bar"><span style="width:${Math.max(2, Math.min(100, g.pct))}%"></span></div>
        <div class="gf">${g.foot}</div>
      </div>`).join('');

    // yearly trend of sub-90 share
    const yc = {};
    scored(ROUNDS).forEach(r => {
      yc[r.year] = yc[r.year] || { n: 0, u90: 0, ndp: 0 };
      yc[r.year].n++;
      if (r.total < 90) yc[r.year].u90++;
      if (r.noDoublePar === true) yc[r.year].ndp++;
    });
    const years = Object.keys(yc).map(Number).sort();
    drawChart('goalChart', {
      type: 'bar',
      data: {
        labels: years.map(String),
        datasets: [
          {
            label: '90타 미만 비율', data: years.map(y => Math.round(yc[y].u90 / yc[y].n * 1000) / 10),
            backgroundColor: 'rgba(5,150,105,.8)', borderRadius: 8, maxBarThickness: 54, yAxisID: 'y'
          },
          {
            label: '노 더블 파 비율', data: years.map(y => Math.round(yc[y].ndp / yc[y].n * 1000) / 10),
            backgroundColor: 'rgba(14,165,233,.55)', borderRadius: 8, maxBarThickness: 54, yAxisID: 'y'
          },
          {
            label: '연도 평균 타수', type: 'line',
            data: years.map(y => {
              const s = scored(ROUNDS).filter(r => r.year === y).map(r => r.total);
              return Math.round(mean(s) * 10) / 10;
            }),
            borderColor: COLORS.amber, backgroundColor: COLORS.amber,
            borderWidth: 2.2, pointRadius: 3, tension: .3, yAxisID: 'y1'
          }
        ]
      },
      options: baseOptions({
        plugins: {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: { callbacks: { label: c => c.dataset.label === '연도 평균 타수' ? `평균 ${c.parsed.y}타` : `${c.dataset.label} ${c.parsed.y}%` } }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, max: 100, title: { display: true, text: '비율(%)', font: { size: 10 } }, grid: { color: 'rgba(226,232,240,.9)' } },
          y1: { position: 'right', beginAtZero: false, title: { display: true, text: '평균 타수', font: { size: 10 } }, grid: { display: false } }
        }
      })
    });
  }

  /* ---------- HEATMAP ---------- */
  function renderHeatmap(rounds) {
    const years = [...new Set(ROUNDS.map(r => r.year))].sort();
    const cells = {};
    rounds.forEach(r => {
      const k = r.year + '-' + r.month;
      const c = cells[k] || (cells[k] = { n: 0, scores: [] });
      c.n++;
      if (hasScore(r)) c.scores.push(r.total);
    });
    const maxCount = Math.max(1, ...Object.values(cells).map(c => c.n));
    const shade = n => {
      if (!n) return null;
      const t = Math.min(1, n / maxCount);
      const alpha = 0.14 + t * 0.7;
      return `rgba(5,150,105,${alpha.toFixed(2)})`;
    };

    const head = ['<div class="hm-cell hm-head"></div>']
      .concat(Array.from({ length: 12 }, (_, i) => `<div class="hm-cell hm-head">${i + 1}월</div>`));
    let html = head.join('');
    years.forEach(y => {
      html += `<div class="hm-cell hm-year">${y}</div>`;
      for (let m = 1; m <= 12; m++) {
        const cell = cells[y + '-' + m];
        if (!cell || !cell.n) {
          html += `<div class="hm-cell hm-empty">·</div>`;
        } else {
          const bg = shade(cell.n);
          const light = cell.n / maxCount > 0.55;
          const avgTxt = cell.scores.length ? fmt1(mean(cell.scores)) : '–';
          const tip = `${y}년 ${m}월 · ${cell.n}라운드` + (cell.scores.length ? ` · 평균 ${fmt1(mean(cell.scores))}타` : ' · 스코어 미입력');
          html += `<div class="hm-cell" style="background:${bg};color:${light ? '#fff' : '#064e3b'}" title="${tip}">
            <span class="n">${cell.n}</span><span class="a">${avgTxt}</span></div>`;
        }
      }
    });
    $('#heatmap').innerHTML = html;
  }

  /* ---------- TABLE ---------- */
  function renderTable(rounds) {
    let rows = rounds.slice();
    const up = upcomingFor();
    const q = state.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        r.club.toLowerCase().includes(q) ||
        r.clubShort.toLowerCase().includes(q) ||
        String(r.year).includes(q) ||
        courseLabel(r, ' ').toLowerCase().includes(q) ||
        r.date.includes(q)
      );
    }
    rows.sort((a, b) => {
      const k = state.sortKey;
      let va, vb;
      if (k === 'club') { va = a.clubShort; vb = b.clubShort; }
      else { va = a[k]; vb = b[k]; }
      if (typeof va === 'string') {
        const c = va.localeCompare(vb, 'ko');
        return state.sortDir === 'asc' ? c : -c;
      }
      const na = va === null || va === undefined, nb = vb === null || vb === undefined;
      if (na || nb) return na && nb ? 0 : (na ? 1 : -1); // 스코어 미입력은 항상 뒤로
      return state.sortDir === 'asc' ? va - vb : vb - va;
    });

    $('#tableCount').textContent = rows.length + '라운드' + (up.length ? ` + 예정 ${up.length}` : '');
    renderSortBar();

    const list = $('#roundsList');
    if (!rows.length && !up.length) {
      list.innerHTML = `<div class="rounds-empty">조건에 맞는 라운드가 없습니다.</div>`;
      return;
    }

    list.innerHTML = up.map(u => upcomingCardHtml(u)).join('') + rows.map(roundCardHtml).join('');

    $$('#roundsList .round-card').forEach(card => {
      const id = card.closest('.round-item').dataset.id;
      card.addEventListener('click', () => toggleRound(id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRound(id); }
      });
    });

    // 펼쳐진 예정 라운드가 있으면 야디지북을 불러와 그린다
    if (up.some(u => u.id === state.openId)) ensureYardage();
  }

  function toggleRound(id) {
    state.openId = state.openId === id ? null : id;
    renderTable(filteredRounds());
    if (state.openId) {
      const el = document.querySelector(`.round-item[data-id="${state.openId}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /* 정렬 컨트롤 — 기존 표 헤더 정렬(날짜·골프장·타수·파 대비)을 그대로 옮긴 버튼 */
  function renderSortBar() {
    $$('#sortBar .sort-btn').forEach(btn => {
      const on = btn.dataset.sort === state.sortKey;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const c = btn.querySelector('.caret');
      if (c) c.textContent = on ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
    });
  }

  function mediaChipsHtml(r) {
    const chips = [];
    const vids = roundVideos(r);
    if (vids.length) {
      const label = vids.length > 1 ? `스윙 영상 ${vids.length}` : '스윙 영상';
      const tip = vids.length > 1 ? `스윙 영상 ${vids.length}개 바로 재생` : '스윙 영상 바로 재생';
      chips.push(`<button class="rc-chip rc-chip-media" type="button" data-vid="${r.id}" data-vidx="0" title="${tip}"><span aria-hidden="true">🎬</span>${label}</button>`);
    }
    if (roundPhotos(r).length) {
      chips.push(`<button class="rc-chip rc-chip-media" type="button" data-photo="${r.id}" data-idx="0" title="라운드 사진 크게 보기"><span aria-hidden="true">📷</span>사진</button>`);
    }
    return chips.join('');
  }

  function roundCardHtml(r) {
    const open = state.openId === r.id;
    const has = hasScore(r);
    const great = has && Number(r.total) >= 80 && Number(r.total) <= 89;
    const chips = mediaChipsHtml(r);
    const courses = (r.courses && r.courses.length) ? courseLabel(r) : '코스 정보 없음';
    const wd = weekdayKo(r.date);
    const [, mm, dd] = r.date.split('-');
    const score = has
      ? `<span class="rc-total ${great ? 'great' : ''}">${r.total}<small>타</small></span>
         <span class="rc-par">${fmtSign(r.toPar)} · 전 ${r.frontScore || '–'} / 후 ${r.backScore || '–'}</span>`
      : `<span class="rc-noscore">미입력</span>`;
    return `<div class="round-item ${open ? 'open' : ''}" data-id="${r.id}">
      <div class="round-card" role="button" tabindex="0" aria-expanded="${open}" aria-label="${esc(r.clubShort)} ${dateKo(r.date)} 라운드 ${has ? r.total + '타' : '스코어 미입력'}">
        <span class="rc-date"><b>${mm}.${dd}</b><i>${r.date.slice(0, 4)}${wd ? ' · ' + wd : ''}</i></span>
        <div class="rc-body">
          <div class="rc-club">${esc(r.clubShort)}</div>
          <div class="rc-sub">${esc(courses)}${r.region ? ' · ' + esc(r.region) : ''}</div>
          ${chips ? `<div class="rc-chips">${chips}</div>` : ''}
        </div>
        <div class="rc-score">${score}</div>
        <span class="rc-chev" aria-hidden="true">⌄</span>
      </div>
      ${open ? `<div class="round-detail">${scorecardHtml(r)}</div>` : ''}
    </div>`;
  }

  function holeClass(h) {
    if (h.toPar <= -1) return 'h0';
    if (h.toPar === 0) return 'h1';
    if (h.toPar === 1) return 'h2';
    if (h.toPar === 2) return 'h3';
    if (h.toPar === 3) return 'h4';
    return 'h5';
  }

  function nineHtml(holes, par, score, title) {
    if (!holes.length) return '';
    const head = `<div class="sc-h"></div>` +
      holes.map(h => `<div class="sc-h">${h.hole}</div>`).join('') +
      `<div class="sc-h sum">계</div>`;
    const pars = `<div class="sc-h sum" style="display:flex;align-items:center;justify-content:center">파</div>` +
      holes.map(h => `<div class="sc-h">${h.par}</div>`).join('') +
      `<div class="sc-total" style="font-size:12px;background:var(--slate-200);color:var(--slate-700)">${par}</div>`;
    const scores = `<div class="sc-h sum" style="display:flex;align-items:center;justify-content:center">타</div>` +
      holes.map(h => `<div class="sc-hole ${holeClass(h)}"><div class="hp">${h.par}파</div><div class="hs">${h.stroke}</div><div class="hd">${fmtSign(h.toPar)}</div></div>`).join('') +
      `<div class="sc-total">${score}<small>타</small></div>`;
    return `<div class="sc-nine-title"><span>${title}</span><span>${score}타 (파 ${par})</span></div>
            <div class="sc-nine">${head}${pars}${scores}</div>`;
  }

  function videoBlockHtml(r) {
    const list = roundVideos(r);
    if (!list.length) return '';
    const multi = list.length > 1;
    const durs = list.map(v => fmtDur(v.durationSec)).join(' · ');
    const notes = Array.from(new Set(list.map(v => v.note).filter(Boolean))).join(' / ');
    const players = list.map((v, i) => `<div class="scv-item">
            <div class="scv-player">
              <video controls playsinline preload="metadata" poster="${v.poster}" src="${v.src}"></video>
              <button class="scv-play" type="button" aria-label="${esc(v.title)}${multi ? ' ' + (i + 1) + '번' : ''} 재생">▶</button>
            </div>
            ${multi ? `<button class="scv-cap" type="button" data-vid="${r.id}" data-vidx="${i}" title="${esc(v.title)} 크게 보기">영상 ${i + 1} · ${esc(v.title)} <small>${fmtDur(v.durationSec)}</small></button>` : ''}
          </div>`).join('');
    return `<div class="sc-video">
        <div class="scv-head">
          <span class="scv-label">🎬 스윙 영상${multi ? ' ' + list.length : ''}</span>
          <span class="scv-sub">${multi ? list.length + '개 · ' : list[0].title + ' · '}${durs}${notes ? ' · ' + esc(notes) : ''}</span>
          <button class="scv-open" type="button" data-vid="${r.id}" data-vidx="0">크게 보기 ⤢</button>
        </div>
        <div class="scv-frame${multi ? ' multi' : ''}">${players}</div>
      </div>`;
  }

  function photoBlockHtml(r) {
    const photos = roundPhotos(r);
    if (!photos.length) return '';
    const thumbs = photos.length > 1 ? `<div class="scp-thumbs">${photos.map((p, i) =>
      `<button class="scp-thumb-btn" type="button" data-photo="${r.id}" data-idx="${i}" aria-label="사진 ${i + 1} 크게 보기"><img src="${p}" alt="" loading="lazy"></button>`
    ).join('')}</div>` : '';
    return `<div class="sc-photo">
        <div class="scv-head">
          <span class="scv-label">📷 라운드 사진</span>
          <span class="scv-sub">${photos.length > 1 ? photos.length + '장 · ' : ''}눌러서 크게 보기</span>
          <button class="scv-open" type="button" data-photo="${r.id}" data-idx="0">크게 보기 ⤢</button>
        </div>
        <div class="scp-frame">
          <button class="scp-img-btn" type="button" data-photo="${r.id}" data-idx="0" aria-label="${r.clubShort} 라운드 사진 크게 보기">
            <img src="${photos[0]}" alt="${r.clubShort} 라운드 사진" loading="lazy">
          </button>
        </div>
        ${thumbs}
      </div>`;
  }

  function mediaBlockHtml(r) {
    const blocks = [videoBlockHtml(r), photoBlockHtml(r)].filter(Boolean);
    if (!blocks.length) return '';
    return `<div class="sc-media ${blocks.length > 1 ? 'two' : 'one'}">${blocks.join('')}</div>`;
  }

  function scorecardHtml(r) {
    const holes = r.holes || [];
    const front = holes.slice(0, 9);
    const back = holes.slice(9, 18);
    const videoBlock = mediaBlockHtml(r);

    const head = `<div class="sc-head">
        <div>
          <h4>${r.clubShort} ${(r.courses && r.courses.length) ? `<span style="font-weight:600;color:var(--slate-400);font-size:12px">${courseLabel(r)}</span>` : ''}</h4>
          <div class="meta">${dateKo(r.date)} ${r.teeTime ? '· ' + r.teeTime + ' 티오프' : ''} · ${hasScore(r) ? `총 ${r.total}타 (파 ${r.par}, ${fmtSign(r.toPar)})` : '스코어 미입력'}</div>
        </div>
        <div class="meta">${hasScore(r) ? `전반 ${r.frontScore} / 후반 ${r.backScore} · 노 더블 파 ${r.noDoublePar ? '달성 ✅' : '미달성'}` : '스코어카드 미저장'}</div>
      </div>`;

    if (!hasScore(r) || !holes.length) {
      return `<div class="scorecard">
      ${head}
      ${videoBlock}
      <div class="sc-pending">
        <span class="scp-ico">📝</span>
        <div><b>스코어카드가 저장되지 않은 라운드입니다.</b>
        <span>일정으로만 확인되어 스코어가 없는 라운드입니다. 통계 계산에서는 제외되고, 라운드 횟수와 지도 방문에는 포함됩니다.</span></div>
      </div>
    </div>`;
    }

    return `<div class="scorecard">
      ${head}
      ${videoBlock}
      <div class="sc-wrap">
        <div class="sc-grid two">
          ${nineHtml(front, r.front.par, r.frontScore, '전반 OUT')}
          ${nineHtml(back, r.back.par, r.backScore, '후반 IN')}
        </div>
      </div>
      <div class="sc-note">색상: <span style="color:#047857;font-weight:700">버디 이하</span> · <span style="color:#0369a1;font-weight:700">파</span> · <span style="color:#334155;font-weight:700">보기</span> · <span style="color:#b45309;font-weight:700">더블</span> · <span style="color:#be123c;font-weight:700">트리플+</span></div>
    </div>`;
  }

  /* ---------- YARDAGE BOOK (예정 라운드) ---------- */
  function upcomingFor() {
    const q = state.search.trim().toLowerCase();
    return UPCOMING.filter(u => {
      if (state.year !== 'all' && String(u.year) !== String(state.year)) return false;
      if (!q) return true;
      return [u.club, u.clubShort, u.region, u.date, u.courseLabel, '예정'].join(' ').toLowerCase().includes(q);
    });
  }

  function upcomingCardHtml(u) {
    const open = state.openId === u.id;
    const [, mm, dd] = u.date.split('-');
    const wd = u.weekday || weekdayKo(u.date);
    const sub = [
      u.courseLabel || (u.courses || []).join(' · '),
      u.region,
      u.teeTime ? u.teeTime + ' 티오프' : ''
    ].filter(Boolean).join(' · ');
    return `<div class="round-item upcoming ${open ? 'open' : ''}" data-id="${u.id}">
      <div class="round-card" role="button" tabindex="0" aria-expanded="${open}" aria-label="${esc(u.clubShort)} ${dateKo(u.date)} 예정 라운드 야디지북">
        <span class="rc-date upcoming"><b>${mm}/${dd}</b><i>${wd ? wd + ' · ' : ''}예정</i></span>
        <div class="rc-body">
          <div class="rc-club">${esc(u.clubShort)}</div>
          <div class="rc-sub">${esc(sub)}</div>
          <div class="rc-chips"><span class="rc-chip rc-chip-plan"><span aria-hidden="true">📓</span>야디지북 준비됨</span></div>
        </div>
        <div class="rc-score"><span class="rc-chip rc-chip-upcoming">📅 예정</span></div>
        <span class="rc-chev" aria-hidden="true">⌄</span>
      </div>
      ${open ? `<div class="round-detail">${yardageBookHtml(u)}</div>` : ''}
    </div>`;
  }

  function yardageBookHtml(u) {
    return `<div class="scorecard yrd" id="yrd">
      <div class="sc-head">
        <div>
          <h4>📓 ${esc(u.clubShort)} 18홀 야디지북</h4>
          <div class="meta">${dateKo(u.date)}${u.weekday ? '(' + u.weekday + ')' : ''}${u.teeTime ? ' · ' + esc(u.teeTime) + ' 티오프' : ''} · 파 ${u.par || 73} · <span id="yrdCourses">18홀</span></div>
        </div>
        <div class="meta yrd-head-note">홀 칩을 누르면 홀 그림·그린맵·티별 거리·공략이 바뀝니다</div>
      </div>
      <div id="yrdBody" class="yrd-body"><div class="yrd-loading">야디지북을 불러오는 중…</div></div>
    </div>`;
  }

  function ensureYardage() {
    const body = $('#yrdBody');
    if (!body) return;
    const u = UPCOMING.find(x => x.id === state.openId) || {};
    const path = u.yardage || 'data/yardage/sunningpoint.json';
    if (state.yrd.doc && state.yrd.path === path) { renderYardage(); return; }
    if (state.yrd.loading) return;
    state.yrd.loading = true;
    fetch(path, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(doc => {
        state.yrd.doc = doc;
        state.yrd.path = path;
        state.yrd.loading = false;
        renderYardage();
      })
      .catch(err => {
        console.error('야디지북 로딩 실패', err);
        state.yrd.loading = false;
        const el = $('#yrdBody');
        if (el) el.innerHTML = `<div class="yrd-loading">야디지북을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</div>`;
      });
  }

  function yrdShots(h) {
    return (h.shots || []).slice()
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .filter(s => Number.isFinite(Number(s.x)) && Number.isFinite(Number(s.y)))
      .map((s, i) => Object.assign({}, s, { x: Number(s.x), y: Number(s.y), n: Number(s.order) || i + 1 }));
  }

  // 궤적(SVG) — 좌표는 그림 위 백분율, viewBox는 그림 실제 픽셀이라 비율이 정확하다
  function yrdTrajectory(h) {
    const W = (h.images && h.images.width) || 558;
    const H = (h.images && h.images.height) || 513;
    const pts = yrdShots(h);
    if (pts.length < 2) return '';
    const px = p => [p.x / 100 * W, p.y / 100 * H];
    let paths = '';
    pts.forEach((p, i) => {
      if (i === 0) return;
      const a = pts[i - 1];
      const [x1, y1] = px(a), [x2, y2] = px(p);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const bend = Math.min(30, len * 0.14);
      const cx = (x1 + x2) / 2 - dy / len * bend;
      const cy = (y1 + y2) / 2 + dx / len * bend;
      const dash = i === 1 ? 'tee' : 'solid';
      paths += `<path class="yrd-arc ${dash}" d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" marker-end="url(#yrdArrow-${dash})"/>`;
    });
    return `<svg class="yrd-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <defs>
        <marker id="yrdArrow-solid" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#0f766e"/></marker>
        <marker id="yrdArrow-tee" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#0ea5e9"/></marker>
      </defs>${paths}</svg>`;
  }

  // 번호 핀 + 샷 라벨(HTML) — 글자는 화면 크기와 무관하게 또렷하게
  function yrdPins(h) {
    const pts = yrdShots(h);
    if (!pts.length) return '';
    return pts.map((p, i) => {
      const label = [p.club, p.lie].filter(Boolean).join(' · ');
      const side = p.x > 60 ? 'left' : 'right';
      const isLast = i === pts.length - 1;
      return `<div class="yrd-pin ${isLast ? 'last' : ''}" style="left:${p.x}%;top:${p.y}%">
        <span class="yrd-dot">${p.n}</span>${label ? `<span class="yrd-tag ${side}">${esc(label)}</span>` : ''}
      </div>`;
    }).join('');
  }

  function renderYardage() {
    const body = $('#yrdBody');
    if (!body) return;
    const doc = state.yrd.doc;
    if (!doc) return;
    const all = doc.courses.reduce((a, c) => a.concat(c.holes), []);
    const hole = all.find(x => x.no === Number(state.yrd.hole)) || all[0];
    const course = doc.courses.find(c => c.code === hole.courseCode) || doc.courses[0];
    const meta = doc.meta || {};
    const tees = meta.tees || ['black', 'blue', 'white', 'yellow', 'red'];
    const teLabels = meta.teeLabels || {};
    const defTee = meta.defaultTee || 'white';
    const W = (hole.images && hole.images.width) || 558;
    const H = (hole.images && hole.images.height) || 513;
    const shots = yrdShots(hole);

    const head = $('#yrdCourses');
    if (head) head.textContent = '18홀 (' + doc.courses.map(c => `${c.code} ${c.holes.length}`).join(' + ') + ')';
    const tabs = doc.courses.map(c => `<button type="button" class="yrd-tab ${c.code === hole.courseCode ? 'active' : ''}" data-ytab="${c.code}">${esc(c.label)}<span>${c.startHole}~${c.endHole}홀 · 파 ${c.par}</span></button>`).join('');
    const chips = doc.courses.map(c => `<div class="yrd-chipgroup"><span class="yrd-chipcourse">${c.code}</span>${c.holes.map(x =>
      `<button type="button" class="yrd-hchip ${x.no === hole.no ? 'active' : ''}" data-yhole="${x.no}" title="${x.no}번 홀 (${c.code} ${x.courseNo}번) · 파${x.par} · HDCP ${x.hdcp}">
        <b>${x.no}</b><i>파${x.par}</i><em>${x.distances[defTee] != null ? x.distances[defTee] + 'm' : ''}</em></button>`).join('')}</div>`).join('');
    const distRows = tees.map(t => `<tr class="${t === defTee ? 'on' : ''}"><th>${esc(teLabels[t] || t)}${t === defTee ? ' <em>기본</em>' : ''}</th><td>${hole.distances[t] != null ? hole.distances[t] : '–'}<small>m</small></td></tr>`).join('');

    const rec = [];
    if (hole.score != null) rec.push(`<span class="yrd-rec"><b>${hole.score}</b>타<em>파${hole.par} ${fmtSign(Number(hole.score) - hole.par)}</em></span>`);
    if (hole.putts != null) rec.push(`<span class="yrd-rec"><b>${hole.putts}</b>퍼트</span>`);
    if (hole.fairway) rec.push(`<span class="yrd-rec">페어웨이 <b>${esc(hole.fairway)}</b></span>`);
    const shotList = shots.length ? `<div class="yrd-shots"><div class="yrd-sec">샷 기록</div><ol>${shots.map(s => `<li><b>${s.n}</b><span>${esc([s.club, s.lie].filter(Boolean).join(' · ') || '기록')}</span></li>`).join('')}</ol></div>` : '';

    body.innerHTML = `
      <div class="yrd-tabs" role="tablist" aria-label="코스 선택">${tabs}</div>
      <div class="yrd-chips" role="group" aria-label="홀 선택">${chips}</div>
      <div class="yrd-main">
        <div class="yrd-stage">
          <div class="yrd-frame" style="aspect-ratio:${W} / ${H}">
            <img class="yrd-img" src="${esc(hole.images.layout)}" alt="${hole.no === hole.courseNo ? `${hole.no}번 홀` : `${hole.no}번 홀(${esc(course.code)} ${hole.courseNo}번)`} 레이아웃" loading="lazy">
            ${yrdTrajectory(hole)}
            ${yrdPins(hole)}
            <span class="yrd-stagetag">${hole.no}번 홀${hole.courseNo !== hole.no ? ` <i>${esc(course.code)} ${hole.courseNo}번</i>` : ''} · 파${hole.par}</span>
          </div>
          <div class="yrd-hint">
            <span class="yrd-hint-ico">💬</span>
            <div><b>${shots.length ? '샷 기록 ' + shots.length + '개가 홀 그림 위에 표시됐습니다.' : '아직 샷 기록이 없습니다.'}</b>
            <span>${shots.length ? '톡으로 새 샷을 보내주시면 번호 핀과 궤적이 바로 이어서 그려집니다.' : '라운드 중 톡으로 "티샷 우측 러프 150m 말뚝 근처", "세컨 그린 온"처럼 보내주시면 이 홀 그림 위 정확한 위치에 번호 핀과 궤적이 바로 표시됩니다.'}</span></div>
          </div>
        </div>
        <aside class="yrd-side">
          <div class="yrd-holehead">
            <span class="yrd-bigno">${hole.no}</span>
            <div>
              <h5>${esc(hole.title || '')}</h5>
              <p>${esc(course.label)} ${hole.courseNo}번${hole.courseNo !== hole.no ? ` (=${hole.no}번)` : ''} · 파 ${hole.par} · HDCP ${hole.hdcp} · ${hole.distances[defTee]}m (${esc(teLabels[defTee] || defTee)})</p>
            </div>
          </div>
          ${rec.length || hole.note ? `<div class="yrd-record">${rec.join('')}${hole.note ? `<span class="yrd-recnote">${esc(hole.note)}</span>` : ''}</div>` : ''}
          <div class="yrd-grid">
            <div class="yrd-sec">티별 거리 <em>단위 m</em></div>
            <table class="yrd-dist"><thead><tr><th>티</th><th>거리</th></tr></thead><tbody>${distRows}</tbody></table>
          </div>
          <div class="yrd-sec">그린맵 · 언듈레이션</div>
          <div class="yrd-greens">
            <figure><img src="${esc(hole.images.greenmap)}" alt="${hole.no}번 홀 그린맵" loading="lazy"><figcaption>Green Map</figcaption></figure>
            <figure><img src="${esc(hole.images.undulation)}" alt="${hole.no}번 홀 언듈레이션" loading="lazy"><figcaption>Undulation</figcaption></figure>
          </div>
          <div class="yrd-tip"><div class="yrd-sec">공략 포인트</div><p>${esc(hole.tip || '')}</p></div>
          ${shotList}
        </aside>
      </div>`;
  }
  function baseOptions(extra) {
    const o = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4 } },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 9, titleFont: { size: 11.5, weight: '700' }, bodyFont: { size: 11.5 }, displayColors: true, boxWidth: 8, boxHeight: 8 } },
      scales: {}
    };
    deepMerge(o, extra || {});
    return o;
  }

  function drawChart(id, cfg) {
    if (charts[id]) charts[id].destroy();
    const el = document.getElementById(id);
    if (!el) return;
    charts[id] = new Chart(el, cfg);
  }

  /* ---------- events ---------- */
  function bindStatic() {
    const search = $('#search');
    let t = null;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.search = search.value;
        renderTable(filteredRounds());
      }, 130);
    });

    // 영상·사진 버튼은 행 펼치기보다 먼저 처리 (capture)
    document.addEventListener('click', e => {
      const vtab = e.target.closest && e.target.closest('[data-vmtab]');
      if (vtab) {
        e.preventDefault();
        e.stopPropagation();
        if (state.video) {
          state.video.idx = Number(vtab.dataset.vmtab) || 0;
          renderVideoModal();
        }
        return;
      }
      const trigger = e.target.closest && e.target.closest('[data-vid]');
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        openVideo(trigger.dataset.vid, Number(trigger.dataset.vidx || 0));
        return;
      }
      const photoTrigger = e.target.closest && e.target.closest('[data-photo]');
      if (photoTrigger) {
        e.preventDefault();
        e.stopPropagation();
        openPhoto(photoTrigger.dataset.photo, Number(photoTrigger.dataset.idx || 0));
        return;
      }
      const pmNav = e.target.closest && e.target.closest('[data-pmnav]');
      if (pmNav) {
        e.preventDefault();
        e.stopPropagation();
        stepPhoto(Number(pmNav.dataset.pmnav));
        return;
      }
      if (e.target.closest && e.target.closest('#pmClose, [data-photo-close]')) {
        closePhoto();
        return;
      }
      if (e.target.closest && e.target.closest('#vmClose, [data-close]')) {
        closeVideo();
        return;
      }
      const playBtn = e.target.closest && e.target.closest('.scv-play');
      if (playBtn) {
        e.stopPropagation();
        const vid = playBtn.parentElement.querySelector('video');
        if (vid) {
          playBtn.style.display = 'none';
          const p = vid.play();
          if (p && p.catch) p.catch(() => { playBtn.style.display = ''; });
        }
        return;
      }

      // 야디지북: 홀 칩 / 코스 탭
      const yHole = e.target.closest && e.target.closest('[data-yhole]');
      if (yHole) {
        e.preventDefault();
        e.stopPropagation();
        state.yrd.hole = Number(yHole.dataset.yhole);
        const doc = state.yrd.doc;
        const h = doc && doc.courses.reduce((a, c) => a.concat(c.holes), []).find(x => x.no === state.yrd.hole);
        if (h) state.yrd.course = h.courseCode;
        renderYardage();
        return;
      }
      const yTab = e.target.closest && e.target.closest('[data-ytab]');
      if (yTab) {
        e.preventDefault();
        e.stopPropagation();
        const code = yTab.dataset.ytab;
        const doc = state.yrd.doc;
        const c = doc && doc.courses.find(x => x.code === code);
        state.yrd.course = code;
        if (c && c.holes.length) state.yrd.hole = c.holes[0].no;
        renderYardage();
        return;
      }
    }, true);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closePhoto(); closeVideo(); }
      if (state.photo && $('#photoModal') && !$('#photoModal').hidden) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); stepPhoto(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); stepPhoto(1); }
      }
    });

    $$('#sortBar .sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.sort;
        if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = k; state.sortDir = k === 'club' ? 'asc' : 'desc'; }
        renderTable(filteredRounds());
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    Chart.defaults.font.family = "'Noto Sans KR', system-ui, sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = '#64748b';
    bindStatic();
    boot();
  });
})();
