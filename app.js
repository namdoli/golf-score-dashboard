/* ⛳ 골프 스코어 대시보드 — app.js */
(function () {
  'use strict';

  const COLORS = {
    emerald: '#059669', emeraldLight: '#34d399', emeraldDark: '#065f46',
    sky: '#0ea5e9', amber: '#f59e0b', rose: '#f43f5e', slate: '#64748b',
    slateLight: '#94a3b8', ink: '#0f172a'
  };

  const state = { year: 'all', search: '', sortKey: 'date', sortDir: 'desc', openId: null };
  let DATA = null, ROUNDS = [], COURSES = [], map = null, markers = [];
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
  const sourceLabel = r => (r.source === 'calendar' ? '애플 캘린더' : r.source);
  function fmtDur(sec) {
    const s = Math.round(sec || 0);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const fmtMB = b => (b / 1048576).toFixed(1) + 'MB';

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
    fetch('data/scores.json', { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(doc => {
        DATA = doc;
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
      `${m.owner} · ${dateKo(m.period.from)} – ${dateKo(m.period.to)} · ${m.counts.rounds}라운드 ${m.counts.holes.toLocaleString()}홀`;
    $('#heroBadges').innerHTML = [
      `<span class="hbadge">핸디캡 <b>${m.handicap.index}</b></span>`,
      `<span class="hbadge">베스트 <b>${m.best}타</b></span>`,
      `<span class="hbadge">평균 <b>${m.avg}타</b></span>`,
      `<span class="hbadge">${m.counts.courses}개 골프장</span>`
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

  /* ---------- render orchestration ---------- */
  function renderAll() {
    updateHint();
    const rounds = filteredRounds();
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
  function openVideo(roundId) {
    const r = ROUNDS.find(x => x.id === roundId);
    if (!r || !r.swingVideo) return;
    const v = r.swingVideo, modal = $('#videoModal'), vid = $('#vmVideo');
    $('#vmTitle').textContent = `${r.clubShort} · ${v.title}`;
    $('#vmSub').textContent = `${dateKo(r.date)}${r.teeTime ? ' ' + r.teeTime + ' 티오프' : ''} · ${hasScore(r) ? `${r.total}타 (파 ${r.par}, ${fmtSign(r.toPar)})` : '스코어 미입력'} · ${v.note}`;
    $('#vmFoot').innerHTML = `<span>${courseLabel(r)} · ${fmtDur(v.durationSec)} · ${fmtMB(v.bytes)}</span>` +
      `<a href="${v.src}" target="_blank" rel="noopener">원본 열기 ↗</a>`;
    vid.poster = v.poster;
    vid.src = v.src;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    vid.load();
    const p = vid.play();
    if (p && p.catch) p.catch(() => {});
    $('#vmClose').focus();
  }

  function closeVideo() {
    const modal = $('#videoModal'), vid = $('#vmVideo');
    if (!modal || modal.hidden) return;
    try { vid.pause(); } catch (e) {}
    vid.removeAttribute('src');
    vid.load();
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  /* ---------- KPI ---------- */
  function renderKpis(rounds) {
    const rated = scored(rounds);
    const pending = rounds.length - rated.length;
    const scores = rated.map(r => r.total);
    const uniq = new Set(rounds.filter(r => r.club !== NO_PLACE).map(r => r.club)).size;
    const totalCourses = COURSES.length;
    const holes = rated.reduce((a, r) => a + (r.holes ? r.holes.length : 0), 0);
    const bestRound = rated.slice().sort((a, b) => a.total - b.total)[0];
    const m = DATA.meta;
    const avg = scores.length ? mean(scores) : 0;

    const cards = [
      {
        label: '총 라운드', icon: '🏌️', value: rounds.length, unit: '회',
        foot: `스코어 <b>${rated.length}</b>건 · ${holes.toLocaleString()}홀${pending ? ` · 미입력 <b>${pending}</b>건` : ''}`
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
        <div class="label">${c.icon} ${c.label}</div>
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
        ${g.mapsUrl ? `<a class="pc-link" href="${g.mapsUrl}" target="_blank" rel="noopener">카카오맵에서 보기 →</a>` : ''}
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
      map.fitBounds(L.featureGroup(domestic).getBounds().pad(0.14));
    });
    const jpChip = document.getElementById('jpChip');
    if (jpChip && jpMarker) jpChip.addEventListener('click', () => {
      map.setView(jpMarker.getLatLng(), 11, { animate: true });
      jpMarker.openPopup();
    });
  }

  /* ---------- TREND ---------- */
  function renderTrend(rounds) {
    const all = scored(ROUNDS);
    const scores = all.map(r => r.total);

    const idx = all.map((r, i) => ({ r, i })).filter(({ r }) => state.year === 'all' || r.year === Number(state.year));
    const labels = idx.map(({ r }) => `${r.date.slice(5)} ${r.clubShort}`);
    const pick = f => idx.map(({ i }) => f(i));

    // 선형 추세선 (라운드당 타수 변화) — 이동평균 없이 성장 흐름만
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
        label: '라운드 스코어', data: pick(i => scores[i]),
        borderColor: COLORS.emerald, backgroundColor: COLORS.emerald,
        borderWidth: 1.8, pointRadius: 2.8, pointHoverRadius: 5, tension: .28
      }
    ];
    if (fit) {
      ds.push({
        label: '성장 추세선', data: pick(i => fit.intercept + fit.slope * i),
        borderColor: COLORS.amber, backgroundColor: COLORS.amber,
        borderWidth: 2.2, borderDash: [7, 5], pointRadius: 0, pointHoverRadius: 0, tension: 0, fill: false
      });
    }

    drawChart('trendChart', {
      type: 'line',
      data: { labels, datasets: ds },
      options: baseOptions({
        plugins: {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 14, boxHeight: 2, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              title: items => items.length ? idx[items[0].dataIndex].r.clubShort + ' · ' + dateKo(idx[items[0].dataIndex].r.date) : '',
              label: c => `${c.dataset.label}: ${fmt1(c.parsed.y)}타`
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
    const avgByYear = years.map(y => mean(yc[y]));
    const counts = years.map(y => yc[y].length);
    drawChart('yearChart', {
      type: 'bar',
      data: {
        labels: years.map(String),
        datasets: [
          {
            label: '연도 평균 타수', data: avgByYear.map(v => Math.round(v * 10) / 10),
            backgroundColor: years.map(y => (state.year === 'all' || state.year === String(y)) ? 'rgba(5,150,105,.82)' : 'rgba(203,213,225,.85)'),
            borderRadius: 8, maxBarThickness: 52, order: 2
          },
          {
            label: '라운드 수', data: counts, type: 'line', yAxisID: 'y1',
            borderColor: COLORS.amber, backgroundColor: COLORS.amber,
            borderWidth: 2, pointRadius: 3, tension: .3, order: 1
          }
        ]
      },
      options: baseOptions({
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => c.dataset.label === '라운드 수' ? `${c.parsed.y}라운드` : `평균 ${c.parsed.y}타` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: false, suggestedMin: avgByYear.length ? Math.min(...avgByYear) - 4 : 70, title: { display: true, text: '평균 타수', font: { size: 10 } }, grid: { color: 'rgba(226,232,240,.9)' } },
          y1: { position: 'right', beginAtZero: true, title: { display: true, text: '라운드', font: { size: 10 } }, grid: { display: false }, ticks: { precision: 0 } }
        }
      })
    });

    // insights — 성장 추이 중심
    const firstY = years[0], lastY = years[years.length - 1];
    const imp = avgByYear[0] - avgByYear[avgByYear.length - 1];
    const recent5 = scores.slice(-5);
    const recent5Best = recent5.length ? Math.min(...recent5) : null;
    const recent5Avg = recent5.length ? mean(recent5) : null;
    const slopeTxt = fit ? `${fit.slope < 0 ? '라운드당 평균 ' + fmt1(Math.abs(fit.slope)) + '타씩 좋아지는' : '라운드당 평균 ' + fmt1(Math.abs(fit.slope)) + '타씩 높아지는'} 흐름` : '';
    const bestR = scored(ROUNDS).slice().sort((a, b) => a.total - b.total)[0];
    const insights = [
      `<div class="insight"><span class="ic">🎯</span><span>${lastY}년 평균은 <b>${fmt1(avgByYear[avgByYear.length - 1])}타</b>, ${firstY}년(${fmt1(avgByYear[0])}타)보다 <b>${fmt1(Math.abs(imp))}타 ${imp >= 0 ? '좋아졌어요' : '높아졌어요'}</b>.</span></div>`,
      recent5.length ? `<div class="insight"><span class="ic">📈</span><span>최근 5라운드 평균 <b>${fmt1(recent5Avg)}타</b> · 최고 <b>${recent5Best}타</b>${slopeTxt ? ` — 전체적으로 ${slopeTxt}예요` : ''}.</span></div>` : '',
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
  function scoreClass(t) {
    if (t <= 85) return 'sb-great';
    if (t <= 92) return 'sb-good';
    if (t <= 99) return 'sb-mid';
    return 'sb-bad';
  }

  function renderTable(rounds) {
    let rows = rounds.slice();
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

    $('#tableCount').textContent = rows.length + '라운드';

    if (!rows.length) {
      $('#roundsBody').innerHTML = `<tr><td colspan="8" style="padding:36px;text-align:center;color:var(--slate-400)">조건에 맞는 라운드가 없습니다.</td></tr>`;
      return;
    }

    $('#roundsBody').innerHTML = rows.map(r => {
      const open = state.openId === r.id;
      const main = `
        <tr class="row ${open ? 'open' : ''}" data-id="${r.id}">
          <td style="white-space:nowrap;color:var(--slate-500)">${dateKo(r.date)}</td>
          <td><div class="cell-club">${r.clubShort}</div>${r.swingVideo
            ? `<button class="swing-chip" type="button" data-vid="${r.id}" title="스윙 영상 바로 재생"><span class="ic">🎬</span>스윙 영상</button>`
            : ''}<div class="cell-courses">${r.region}</div></td>
          <td style="color:var(--slate-500);font-size:12px">${(r.courses && r.courses.length) ? courseLabel(r) : '–'}</td>
          <td>${hasScore(r)
            ? `<span class="score-badge ${scoreClass(r.total)}">${r.total}</span>`
            : `<span class="score-pending">미입력</span>`}</td>
          <td class="toPar">${hasScore(r) ? fmtSign(r.toPar) : '–'}</td>
          <td style="color:var(--slate-600)">${r.frontScore || '–'}<span style="color:var(--slate-300)"> / ${r.front.par || '–'}</span></td>
          <td style="color:var(--slate-600)">${r.backScore || '–'}<span style="color:var(--slate-300)"> / ${r.back.par || '–'}</span></td>
          <td class="td-center">${r.noDoublePar ? '<span class="tag tag-ok">달성</span>' : '<span class="tag tag-no">–</span>'}</td>
        </tr>`;
      if (!open) return main;
      return main + `<tr class="scorecard-row"><td colspan="8">${scorecardHtml(r)}</td></tr>`;
    }).join('');

    $$('#roundsBody tr.row').forEach(tr => tr.addEventListener('click', () => {
      const id = tr.dataset.id;
      state.openId = state.openId === id ? null : id;
      renderTable(filteredRounds());
      if (state.openId) {
        const el = document.querySelector(`tr.row[data-id="${state.openId}"]`);
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }));
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

  function scorecardHtml(r) {
    const holes = r.holes || [];
    const front = holes.slice(0, 9);
    const back = holes.slice(9, 18);
    const videoBlock = r.swingVideo ? `<div class="sc-video">
        <div class="scv-head">
          <span class="scv-label">🎬 스윙 영상</span>
          <span class="scv-sub">${r.swingVideo.title} · ${fmtDur(r.swingVideo.durationSec)} · ${r.swingVideo.note}</span>
          <button class="scv-open" type="button" data-vid="${r.id}">크게 보기 ⤢</button>
        </div>
        <div class="scv-frame">
          <div class="scv-player">
            <video controls playsinline preload="metadata" poster="${r.swingVideo.poster}" src="${r.swingVideo.src}"></video>
            <button class="scv-play" type="button" aria-label="${r.swingVideo.title} 재생">▶</button>
          </div>
        </div>
      </div>` : '';

    const head = `<div class="sc-head">
        <div>
          <h4>${r.clubShort} <span style="font-weight:600;color:var(--slate-400);font-size:12px">${courseLabel(r)}</span></h4>
          <div class="meta">${dateKo(r.date)} ${r.teeTime ? '· ' + r.teeTime + ' 티오프' : ''} · ${hasScore(r) ? `총 ${r.total}타 (파 ${r.par}, ${fmtSign(r.toPar)})` : '스코어 미입력'} · ${sourceLabel(r)}</div>
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
        <span>${r.source === 'calendar' ? '애플 캘린더 일정으로만 확인된 라운드' : '스코어를 입력하지 않은 라운드'}입니다. 통계 계산에서는 제외되고, 라운드 횟수와 지도 방문에는 포함됩니다.</span></div>
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

  /* ---------- charts ---------- */
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

    // 영상 버튼은 행 펼치기보다 먼저 처리 (capture)
    document.addEventListener('click', e => {
      const trigger = e.target.closest && e.target.closest('[data-vid]');
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        openVideo(trigger.dataset.vid);
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
      }
    }, true);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeVideo();
    });

    $$('#roundsTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = k; state.sortDir = k === 'club' ? 'asc' : 'desc'; }
        $$('#roundsTable th').forEach(x => {
          x.classList.toggle('sorted', x.dataset.sort === state.sortKey);
          const c = x.querySelector('.caret');
          if (c) c.textContent = x.dataset.sort === state.sortKey ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
        });
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
