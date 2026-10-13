(() => {
  'use strict';

  // ---- Konfigurasi fase ----
  const PHASES = [
    { id: 'beranda',   name: 'Beranda',   short: 'Beranda',   color: '#12303B' },
    { id: 'engage',    name: 'Engage',    short: 'Engage',    color: '#E74C3C' },
    { id: 'explore',   name: 'Explore',   short: 'Explore',   color: '#E67E22' },
    { id: 'explain',   name: 'Explain',   short: 'Explain',   color: '#F39C12' },
    { id: 'elaborate', name: 'Elaborate', short: 'Elaborate', color: '#27AE60' },
    { id: 'evaluate',  name: 'Evaluate',  short: 'Evaluate',  color: '#2980B9' },
    { id: 'refleksi',  name: 'Refleksi',  short: 'Refleksi',  color: '#8E44AD' }
  ];
  const TOTAL = PHASES.length - 1;           // 6 fase belajar (tanpa Beranda)
  const STORAGE_KEY = 'virus5e:progress:v1';
  const ENGAGE_KEY = 'virus5e:engage:v1';     // jawaban self-check, dibaca lagi di fase Explain
  const NEXT_LABEL = { 1: 'Lanjut ke Explore' };

  // ---- State + LocalStorage ----
  const defaultState = () => ({ current: 0, completed: [] });
  let state = loadState();

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw && Number.isInteger(raw.current) && Array.isArray(raw.completed)) {
        return {
          current: Math.min(Math.max(raw.current, 0), TOTAL),
          completed: [...new Set(raw.completed.filter(n => Number.isInteger(n) && n >= 1 && n <= TOTAL))]
        };
      }
    } catch (e) { /* storage tidak tersedia / rusak */ }
    return defaultState();
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* abaikan */ }
  }

  // ---- Elemen ----
  const $ = id => document.getElementById(id);
  const sections = [...document.querySelectorAll('.phase')];
  const nav = $('bottomNav');
  const pager = $('pager');

  // ---- Render navigasi bawah + legenda ----
  PHASES.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nav-btn';
    b.dataset.phase = i;
    b.style.setProperty('--c', p.color);
    b.setAttribute('aria-label', p.name);
    b.innerHTML = `<span class="nav-dot">${i === 0 ? '⌂' : i}</span><span>${p.short}</span>`;
    b.addEventListener('click', () => goTo(i));
    nav.appendChild(b);

    if (i > 0) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot" style="background:${p.color}"></span>${p.name}`;
      $('legend').appendChild(li);
    }
  });

  // ---- Navigasi antar fase (SPA) ----
  function goTo(i, fromHash) {
    i = Math.min(Math.max(i, 0), TOTAL);
    state.current = i;
    saveState();

    sections.forEach(s => { s.hidden = Number(s.dataset.phase) !== i; });
    const p = PHASES[i];
    document.documentElement.style.setProperty('--accent', p.color);
    $('phaseLabel').textContent = i === 0 ? 'Beranda' : `Fase ${i}: ${p.name}`;
    document.querySelector('meta[name="theme-color"]').content = i === 0 ? '#12303B' : p.color;

    // pager (Sebelumnya / Selesai & Lanjut)
    pager.hidden = i === 0;
    if (i > 0) {
      $('btnNext').textContent = i === TOTAL ? 'Selesai' : (NEXT_LABEL[i] || 'Selesai & Lanjut');
    }
    refreshNext();

    updateUI();
    if (!fromHash && location.hash !== '#' + p.id) history.pushState(null, '', '#' + p.id);
    window.scrollTo({ top: 0 });
    const h = sections[i].querySelector('h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function completePhase(i) {
    if (i >= 1 && !state.completed.includes(i)) state.completed.push(i);
    saveState();
  }

  // ---- Update progress bar & nav ----
  function updateUI() {
    const done = state.completed.length;
    const pct = Math.round((done / TOTAL) * 100);
    $('progressFill').style.width = pct + '%';
    $('progress').setAttribute('aria-valuenow', pct);
    $('progressText').textContent = `${done} dari ${TOTAL} fase selesai`;

    nav.querySelectorAll('.nav-btn').forEach(b => {
      const i = Number(b.dataset.phase);
      b.classList.toggle('active', i === state.current);
      b.classList.toggle('done', state.completed.includes(i));
      b.setAttribute('aria-current', i === state.current ? 'page' : 'false');
    });

    const start = $('btnStart');
    start.textContent = done === 0 ? 'Mulai Belajar' : 'Lanjutkan Belajar';
    $('btnReset').hidden = done === 0 && state.current === 0;
  }

  // ---- Fase 1: Self-Check Miskonsepsi (tanpa skor) ----
  // Format tersimpan: { answers: { s1: { answer:'benar'|'salah', key:'salah', reason:'' }, ... } }
  let engage = loadEngage();
  function loadEngage() {
    try {
      const r = JSON.parse(localStorage.getItem(ENGAGE_KEY));
      if (r && r.answers && typeof r.answers === 'object') return r;
    } catch (e) { /* abaikan */ }
    return { answers: {} };
  }
  function saveEngage() {
    try { localStorage.setItem(ENGAGE_KEY, JSON.stringify(engage)); } catch (e) { /* abaikan */ }
  }

  const stmts = [...document.querySelectorAll('.stmt')];
  const engageDone = () => stmts.every(el => engage.answers[el.dataset.id]);

  function fillReasons() {
    stmts.forEach(el => {
      const a = engage.answers[el.dataset.id];
      el.querySelector('.stmt-reason').value = a && a.reason ? a.reason : '';
    });
  }

  function updateEngageUI() {
    let n = 0;
    stmts.forEach(el => {
      const a = engage.answers[el.dataset.id];
      if (a) n++;
      el.querySelectorAll('.choice-btn').forEach(b => {
        const on = !!a && a.answer === b.dataset.val;
        b.classList.toggle('selected', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      el.querySelector('.stmt-reflect').hidden = !a;
      el.querySelector('.stmt-answer').textContent = a ? 'Pemikiranmu sekarang: ' + (a.answer === 'benar' ? 'Benar' : 'Salah') : '';
    });
    $('engageCount').textContent = `${n} dari ${stmts.length} pernyataan dijawab`;
    const done = n === stmts.length;
    $('gateHint').hidden = done;
    $('engageDone').hidden = !done;
    refreshNext();
  }

  stmts.forEach(el => {
    el.querySelectorAll('.choice-btn').forEach(b => {
      b.addEventListener('click', () => {
        const prev = engage.answers[el.dataset.id];
        engage.answers[el.dataset.id] = {
          answer: b.dataset.val,
          key: el.dataset.key,
          reason: prev ? prev.reason : ''
        };
        saveEngage();
        updateEngageUI();
      });
    });
    el.querySelector('.stmt-reason').addEventListener('input', e => {
      const a = engage.answers[el.dataset.id];
      if (a) { a.reason = e.target.value; saveEngage(); }
    });
  });

  // Tombol "Selesai & Lanjut" terkunci sampai syarat fase terpenuhi
  function refreshNext() {
    $('btnNext').disabled = state.current === 1 && !engageDone();
  }

  // ---- Event ----
  $('btnStart').addEventListener('click', () => {
    // Pertama kali -> Engage; selanjutnya -> fase pertama yang belum selesai
    let next = 1;
    while (next <= TOTAL && state.completed.includes(next)) next++;
    goTo(next > TOTAL ? 1 : next);
  });

  $('btnPrev').addEventListener('click', () => goTo(state.current - 1));
  $('btnNext').addEventListener('click', () => {
    completePhase(state.current);
    goTo(state.current === TOTAL ? 0 : state.current + 1);
  });

  $('btnReset').addEventListener('click', () => {
    if (confirm('Hapus semua progres belajar di perangkat ini?')) {
      state = defaultState();
      saveState();
      engage = { answers: {} };
      try { localStorage.removeItem(ENGAGE_KEY); } catch (e) { /* abaikan */ }
      fillReasons();
      updateEngageUI();
      goTo(0);
    }
  });

  // Tombol back/forward browser
  window.addEventListener('popstate', () => {
    const idx = PHASES.findIndex(p => '#' + p.id === location.hash);
    goTo(idx === -1 ? 0 : idx, true);
  });

  // ---- Init: lanjutkan dari fase terakhir ----
  fillReasons();
  updateEngageUI();
  const hashIdx = PHASES.findIndex(p => '#' + p.id === location.hash);
  goTo(hashIdx !== -1 ? hashIdx : state.current, true);
})();
