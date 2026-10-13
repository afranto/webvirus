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
  const NEXT_LABEL = { 1: 'Lanjut ke Explore', 2: 'Lanjut ke Explain', 3: 'Lanjut ke Elaborate' };

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
    document.body.dataset.phase = i;
    if (i === 3) renderExplain();
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
    $('btnNext').hidden = state.current === 2 && !exploreDone();
  }

  // ---- Fase 2: Explore (Struktur + Replikasi) ----
  // Format tersimpan: { visited:['rna',...], simDone:bool, check:'benar'|null }
  const EX_KEY = 'virus5e:explore:v1';
  const PARTS = {
    rna:   { t: 'a. Asam nukleat (RNA)', d: 'Materi genetik virus. Pada SARS-CoV-2 berupa RNA untai tunggal yang memuat "resep" untuk membuat protein virus baru. Virus lain bisa memiliki DNA.' },
    cap:   { t: 'b. Kapsid', d: 'Lapisan protein yang membungkus dan melindungi asam nukleat. Pada SARS-CoV-2, protein pembungkus RNA disebut nukleokapsid.' },
    env:   { t: 'c. Envelope', d: 'Selubung berlemak yang berasal dari membran sel inang. Tidak semua virus memilikinya. Lapisan lemak ini mudah rusak oleh sabun, itulah sebabnya cuci tangan efektif.' },
    spike: { t: 'd. Spike protein', d: 'Protein berbentuk paku di permukaan virus. Spike mengenali dan menempel pada reseptor sel inang (pada SARS-CoV-2: reseptor ACE2), seperti kunci yang cocok dengan gemboknya.' }
  };
  const SIM = [
    { t: '1. Attachment (Pelekatan)', d: 'Spike pada permukaan virus menempel pada reseptor di membran sel inang. Hanya sel dengan reseptor yang cocok yang dapat diinfeksi.' },
    { t: '2. Entry (Penetrasi)', d: 'Virus masuk ke dalam sel inang, misalnya ditelan dalam gelembung membran (endositosis) atau selubungnya menyatu dengan membran sel.' },
    { t: '3. Uncoating (Pelepasan selubung)', d: 'Selubung dan kapsid terbuka sehingga RNA virus terlepas ke sitoplasma sel inang.' },
    { t: '4. Biosintesis / Replikasi', d: 'Virus tidak punya mesin sendiri. RNA virus memakai ribosom dan bahan milik sel inang untuk menyalin dirinya dan membuat protein virus.' },
    { t: '5. Assembly (Perakitan)', d: 'RNA baru dan protein virus dirakit menjadi virion-virion baru di dalam sel inang.' },
    { t: '6. Release (Pelepasan)', d: 'Virion baru keluar dari sel inang, misalnya lewat eksositosis atau sel pecah, lalu siap menginfeksi sel-sel lain.' }
  ];
  let ex = loadEx();
  let step = ex.simDone ? 6 : 1;
  function loadEx() {
    try {
      const r = JSON.parse(localStorage.getItem(EX_KEY));
      if (r && Array.isArray(r.visited)) return { visited: r.visited.filter(p => PARTS[p]), simDone: !!r.simDone, check: r.check === 'benar' ? 'benar' : null };
    } catch (e) { /* abaikan */ }
    return { visited: [], simDone: false, check: null };
  }
  function saveEx() { try { localStorage.setItem(EX_KEY, JSON.stringify(ex)); } catch (e) { /* abaikan */ } }
  function exploreDone() { return ex.check === 'benar'; }

  // Tab
  function showTab(name) {
    const rep = name === 'rep';
    $('panelStruct').hidden = rep;
    $('panelRep').hidden = !rep;
    [['tabStruct', !rep], ['tabRep', rep]].forEach(([id, on]) => {
      $(id).classList.toggle('active', on);
      $(id).setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  $('tabStruct').addEventListener('click', () => showTab('struct'));
  $('tabRep').addEventListener('click', () => showTab('rep'));
  $('toRep').addEventListener('click', () => { showTab('rep'); $('tabRep').scrollIntoView({ block: 'start' }); });

  // Hotspot
  function updateStruct() {
    document.querySelectorAll('[data-part]').forEach(b => b.classList.toggle('visited', ex.visited.includes(b.dataset.part)));
    const n = ex.visited.length;
    $('hsCount').textContent = `${n} dari 4 bagian dipelajari`;
    const all = n === 4;
    $('toRep').hidden = !all;
    $('tabRep').disabled = !all;
  }
  function openPart(part) {
    if (!ex.visited.includes(part)) { ex.visited.push(part); saveEx(); }
    $('virSvg').dataset.active = part;
    const info = $('hsInfo');
    info.innerHTML = '<h3></h3><p></p>';
    info.querySelector('h3').textContent = PARTS[part].t;
    info.querySelector('p').textContent = PARTS[part].d;
    updateStruct();
  }
  document.querySelectorAll('[data-part]').forEach(b => b.addEventListener('click', () => openPart(b.dataset.part)));

  // Simulasi 6 tahap (berurutan)
  function renderSim() {
    $('simStage').querySelectorAll('[data-s]').forEach(e => e.classList.toggle('on', e.dataset.s === String(step)));
    $('simTitle').textContent = SIM[step - 1].t;
    $('simDesc').textContent = SIM[step - 1].d;
    $('simDots').querySelectorAll('i').forEach((d, i) => {
      d.classList.toggle('done', i < step - 1);
      d.classList.toggle('now', i === step - 1);
    });
    $('simPrev').disabled = step === 1;
    const next = $('simNext');
    next.textContent = step < 6 ? 'Selanjutnya' : (ex.simDone ? 'Selesai' : 'Selesai Simulasi');
    next.disabled = step === 6 && ex.simDone;
    $('checkpoint').hidden = !ex.simDone;
  }
  $('simPrev').addEventListener('click', () => { if (step > 1) { step--; renderSim(); } });
  $('simReset').addEventListener('click', () => { step = 1; renderSim(); });
  $('simNext').addEventListener('click', () => {
    if (step < 6) step++;
    else if (!ex.simDone) { ex.simDone = true; saveEx(); }
    renderSim();
    if (ex.simDone && step === 6) $('checkpoint').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Checkpoint
  function renderCheck() {
    const fb = $('cpFeedback');
    document.querySelectorAll('.cp-opt').forEach(o => o.classList.remove('sel-ok', 'sel-wrong'));
    if (ex.check === 'benar') {
      document.querySelector('.cp-opt[data-ok="1"]').classList.add('sel-ok');
      fb.textContent = 'Tepat! Pada uncoating, RNA virus terlepas di dalam sel inang, sehingga tahap biosintesis bisa dimulai. Tombol lanjut sudah terbuka.';
    } else { fb.textContent = ''; }
    refreshNext();
  }
  document.querySelectorAll('.cp-opt').forEach(o => o.addEventListener('click', () => {
    if (o.dataset.ok === '1') { ex.check = 'benar'; saveEx(); renderCheck(); }
    else { o.classList.add('sel-wrong'); $('cpFeedback').textContent = 'Belum tepat. Lihat lagi tahap 3 pada simulasi, lalu coba pilih ulang.'; }
  }));

  function resetExplore() {
    ex = { visited: [], simDone: false, check: null };
    try { localStorage.removeItem(EX_KEY); } catch (e) { /* abaikan */ }
    step = 1;
    delete $('virSvg').dataset.active;
    $('hsInfo').innerHTML = '<p>Belum ada bagian yang dipilih.</p>';
    showTab('struct');
    updateStruct(); renderSim(); renderCheck();
  }

  // ---- Fase 3: Explain (bandingkan jawaban Engage dengan fakta) ----
  const FACTS = {
    s1: { fakta: 'Virus bukan sel, apalagi sel tunggal. Virus hanya partikel berisi asam nukleat dan protein, tanpa sitoplasma, organel, atau metabolisme sendiri. Di luar sel inang ia tidak menunjukkan ciri hidup, sehingga banyak ilmuwan menempatkannya di perbatasan benda hidup dan tak hidup.',
          empati: 'Wajar kalau kamu berpikir begitu, karena virus bisa memperbanyak diri dan membuat orang sakit sehingga tampak seperti makhluk hidup. Yang perlu diluruskan: ia tidak tersusun atas sel.' },
    s2: { fakta: 'Virus berbeda dari bakteri. Bakteri adalah sel prokariotik yang hidup mandiri dan membelah diri, sedangkan virus bukan sel dan wajib berada di dalam sel inang. Perbedaan ukuran hanya salah satunya. Karena itu antibiotik efektif untuk bakteri tetapi tidak untuk virus.',
          empati: 'Wajar kalau keduanya tertukar, karena sama-sama tak terlihat mata dan sama-sama bisa menyebabkan penyakit. Tetapi strukturnya berbeda mendasar.' },
    s3: { fakta: 'Virus tidak dapat berkembang biak sendiri. Ia wajib memakai sel inang (ribosom, energi, dan bahan penyusun) untuk replikasi, sehingga disebut parasit obligat intraseluler.',
          empati: 'Wajar kalau tampak begitu, sebab penyebaran virus dari orang ke orang terlihat seperti "berkembang biak". Di tingkat sel, virus tetap bergantung pada sel inang.' }
  };
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function renderExplain() {
    const box = $('cmpList');
    box.textContent = '';
    const saved = loadEngage().answers;
    if (!Object.keys(saved).length) {
      const n = el('div', 'cmp-empty');
      n.appendChild(el('p', '', 'Kamu belum mengisi Self-Check di fase Engage. Tidak apa-apa, baca saja fakta ilmiahnya di bawah ini. Kalau mau, kamu bisa mengisinya dulu.'));
      const b = el('button', 'btn btn-ghost', 'Isi Self-Check di Engage');
      b.type = 'button';
      b.addEventListener('click', () => goTo(1));
      n.appendChild(b);
      box.appendChild(n);
    }
    stmts.forEach(s => {
      const id = s.dataset.id, a = saved[id], f = FACTS[id];
      const item = el('div', 'cmp-item');
      item.appendChild(el('p', 'cmp-stmt', '\u201C' + s.querySelector('.stmt-text').textContent + '\u201D'));
      const cols = el('div', 'cmp-cols');
      const mine = el('div', 'cmp-box mine');
      mine.appendChild(el('h4', '', 'Jawabanmu'));
      mine.appendChild(el('p', '', a ? (a.answer === 'benar' ? 'Benar' : 'Salah') : 'Belum dijawab'));
      if (a && a.reason) mine.appendChild(el('p', '', 'Alasanmu: ' + a.reason));
      const fact = el('div', 'cmp-box fact');
      fact.appendChild(el('h4', '', 'Fakta ilmiah: pernyataan ini salah'));
      fact.appendChild(el('p', '', f.fakta));
      cols.append(mine, fact);
      item.appendChild(cols);
      item.appendChild(el('p', 'cmp-note', a && a.answer === 'salah' ? 'Pemikiranmu sudah tepat. Kamu punya dasar yang baik untuk memahami replikasi virus.' : f.empati));
      box.appendChild(item);
    });
  }

  // Glosarium: buka satu per satu
  document.querySelectorAll('.gloss details').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) document.querySelectorAll('.gloss details').forEach(o => { if (o !== d) o.open = false; });
  }));

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
      resetExplore();
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
  updateStruct(); renderSim(); renderCheck();
  const hashIdx = PHASES.findIndex(p => '#' + p.id === location.hash);
  goTo(hashIdx !== -1 ? hashIdx : state.current, true);
})();
