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
  const NEXT_LABEL = { 1: 'Lanjut ke Explore', 2: 'Lanjut ke Explain', 3: 'Lanjut ke Elaborate', 4: 'Lanjut ke Ujian (Evaluate)', 5: 'Lanjut ke Refleksi' };

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
    if (i === 4) { track.scrollLeft = 0; updateCaseNav(); }
    if (i !== 6) { cancelAnimationFrame(confettiRaf); $('confetti').hidden = true; }
    if (i === 6) { renderBadge(); launchConfetti(); }
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
    $('btnNext').hidden = (state.current === 2 && !exploreDone()) || (state.current === 5 && !quizDone());
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

  // ---- Fase 4: Elaborate (kartu kasus swipe + soal aplikasi) ----
  // Format tersimpan: { answer: 'teks jawaban refleksi' }
  const EL_KEY = 'virus5e:elaborate:v1';
  const track = $('caseTrack');
  const cases = [...track.children];
  function caseStep() { return cases.length > 1 ? cases[1].offsetLeft - cases[0].offsetLeft : track.clientWidth; }
  function caseIndex() {
    if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) return cases.length - 1;
    return Math.min(cases.length - 1, Math.round(track.scrollLeft / caseStep()));
  }
  function updateCaseNav() {
    const i = caseIndex();
    $('caseCount').textContent = `Kasus ${i + 1} dari ${cases.length}`;
    $('casePrev').disabled = i === 0;
    $('caseNext').disabled = i === cases.length - 1;
  }
  track.addEventListener('scroll', () => requestAnimationFrame(updateCaseNav), { passive: true });
  $('casePrev').addEventListener('click', () => track.scrollTo({ left: (caseIndex() - 1) * caseStep(), behavior: 'smooth' }));
  $('caseNext').addEventListener('click', () => track.scrollTo({ left: (caseIndex() + 1) * caseStep(), behavior: 'smooth' }));

  function loadEl() {
    try { const r = JSON.parse(localStorage.getItem(EL_KEY)); if (r && typeof r.answer === 'string') return r.answer; } catch (e) { /* abaikan */ }
    return '';
  }
  function updateApply() {
    const ok = $('applyAns').value.trim().length >= 20;   // sudah menulis sebelum melihat pembahasan
    $('applyDiscuss').hidden = !ok;
    $('applyHint').hidden = ok;
  }
  $('applyAns').addEventListener('input', e => {
    try { localStorage.setItem(EL_KEY, JSON.stringify({ answer: e.target.value })); } catch (err) { /* abaikan */ }
    updateApply();
  });
  function resetElaborate() {
    try { localStorage.removeItem(EL_KEY); } catch (e) { /* abaikan */ }
    $('applyAns').value = '';
    $('applyDiscuss').open = false;
    updateApply();
  }

  // ---- Fase 5: Evaluate (kuis formatif, satu soal per layar) ----
  // Format tersimpan: { answers:[indeks|null x5], done:bool, best:number|null }
  const QZ_KEY = 'virus5e:evaluate:v1';
  const QUIZ = [
    { topic: 'Struktur: kapsid', q: 'Bagian virus yang membungkus langsung asam nukleat dan tersusun dari protein disebut ...',
      opts: ['Spike protein', 'Kapsid', 'Ribosom', 'Envelope'], ans: 1,
      ok: 'Kapsid adalah pembungkus protein yang melindungi asam nukleat.',
      why: ['Spike berada di permukaan virus dan berfungsi menempel pada reseptor sel inang.', null, 'Virus tidak punya ribosom. Ribosom adalah milik sel inang.', 'Envelope adalah selubung lemak di luar kapsid, bukan pembungkus langsung asam nukleat.'] },
    { topic: 'Urutan 6 tahap replikasi', q: 'Urutan tahap infeksi virus yang benar adalah ...',
      opts: ['Attachment → Uncoating → Entry → Biosintesis → Assembly → Release',
             'Entry → Attachment → Uncoating → Biosintesis → Release → Assembly',
             'Attachment → Entry → Uncoating → Biosintesis → Assembly → Release',
             'Attachment → Entry → Biosintesis → Uncoating → Release → Assembly'], ans: 2,
      ok: 'Virus menempel, masuk, melepas selubung, mereplikasi diri, dirakit, lalu keluar.',
      why: ['Virus harus masuk (entry) dulu sebelum selubungnya dilepas (uncoating).', 'Virus harus menempel (attachment) dulu sebelum masuk, dan virion dirakit dulu sebelum dilepas.', null,
            'Materi genetik harus terlepas (uncoating) dulu sebelum disalin pada biosintesis, dan virion dirakit dulu sebelum dilepas.'] },
    { topic: 'Tahap uncoating', q: 'Apa yang terjadi pada tahap uncoating?',
      opts: ['Virion baru keluar dari sel inang', 'Spike menempel pada reseptor sel inang', 'Materi genetik virus disalin dan protein virus dibuat',
             'Selubung dan kapsid terbuka sehingga asam nukleat virus terlepas di dalam sel inang'], ans: 3,
      ok: 'Uncoating melepaskan asam nukleat virus di dalam sel inang sehingga siap disalin.',
      why: ['Itu tahap release (pelepasan).', 'Itu tahap attachment (pelekatan).', 'Itu tahap biosintesis, yang terjadi setelah uncoating.', null] },
    { topic: 'Tahap biosintesis', q: 'Pada tahap biosintesis, siapa yang menyediakan ribosom dan energi untuk membuat protein virus?',
      opts: ['Sel inang', 'Virus itu sendiri', 'Kapsid', 'Envelope'], ans: 0,
      ok: 'Virus tidak punya mesin sendiri, sehingga ia memakai ribosom dan energi milik sel inang.',
      why: [null, 'Virus tidak punya ribosom maupun metabolisme sendiri.', 'Kapsid hanya pelindung asam nukleat, tidak membuat protein.', 'Envelope adalah selubung lemak, tidak berfungsi dalam sintesis protein.'] },
    { topic: 'Spike dan attachment', q: 'Mengapa suatu virus hanya dapat menginfeksi sel tertentu?',
      opts: ['Karena virus hanya hidup di tempat yang dingin', 'Karena envelope virus menghasilkan energi', 'Karena spike virus hanya cocok dengan reseptor pada sel tertentu',
             'Karena ribosom virus hanya bekerja pada satu jenis sel'], ans: 2,
      ok: 'Spike bekerja seperti kunci yang hanya cocok dengan reseptor (gembok) pada sel tertentu.',
      why: ['Suhu bukan penentu utama sel yang dapat diinfeksi. Yang menentukan adalah kecocokan spike dan reseptor.', 'Envelope adalah selubung lemak dan tidak menghasilkan energi.', null, 'Virus tidak punya ribosom.'] }
  ];
  let qz = loadQz();
  let cur = qz.answers.indexOf(null) === -1 ? QUIZ.length - 1 : qz.answers.indexOf(null);
  function loadQz() {
    try {
      const r = JSON.parse(localStorage.getItem(QZ_KEY));
      if (r && Array.isArray(r.answers) && r.answers.length === QUIZ.length) {
        return { answers: r.answers.map(a => (Number.isInteger(a) && a >= 0 && a < 4) ? a : null), done: !!r.done, best: Number.isInteger(r.best) ? r.best : null };
      }
    } catch (e) { /* abaikan */ }
    return { answers: Array(QUIZ.length).fill(null), done: false, best: null };
  }
  function saveQz() { try { localStorage.setItem(QZ_KEY, JSON.stringify(qz)); } catch (e) { /* abaikan */ } }
  function quizDone() { return qz.done; }
  function quizScore() { return qz.answers.filter((a, i) => a === QUIZ[i].ans).length; }

  function renderQuiz(animate) {
    $('quizBox').hidden = qz.done;
    $('quizResult').hidden = !qz.done;
    if (qz.done) { renderResult(); refreshNext(); return; }
    const Q = QUIZ[cur];
    $('quizCount').textContent = `Soal ${cur + 1} dari ${QUIZ.length}`;
    $('quizQ').textContent = Q.q;
    const box = $('quizOpts');
    box.textContent = '';
    Q.opts.forEach((t, i) => {
      const b = el('button', 'qopt');
      b.type = 'button';
      b.append(el('span', 'qletter', 'ABCD'[i]), el('span', '', t));
      b.addEventListener('click', () => answerQ(i));
      box.appendChild(b);
    });
    showAnswerState();
    if (animate) {
      const body = $('quizBody');
      body.classList.remove('slide-in'); void body.offsetWidth; body.classList.add('slide-in');
      $('quizQ').setAttribute('tabindex', '-1'); $('quizQ').focus({ preventScroll: true });
    }
    refreshNext();
  }
  function showAnswerState() {
    const Q = QUIZ[cur], a = qz.answers[cur], fb = $('quizFb');
    const btns = [...$('quizOpts').children];
    $('quizBarFill').style.width = ((cur + (a !== null ? 1 : 0)) / QUIZ.length * 100) + '%';
    fb.textContent = ''; fb.className = 'q-fb';
    $('quizNext').hidden = a === null;
    if (a === null) return;
    btns.forEach((b, i) => {
      b.disabled = true;
      if (i === Q.ans) b.classList.add('ok');
      else if (i === a) b.classList.add('bad');
    });
    if (a === Q.ans) {
      fb.classList.add('ok');
      fb.append(el('strong', '', 'Tepat! '), document.createTextNode(Q.ok));
    } else {
      fb.classList.add('bad');
      fb.append(el('strong', '', 'Belum tepat. '), document.createTextNode(`${Q.why[a]} Jawaban yang benar: ${'ABCD'[Q.ans]}. ${Q.opts[Q.ans]}`));
    }
    $('quizNext').textContent = cur === QUIZ.length - 1 ? 'Lihat Skor' : 'Soal berikutnya';
  }
  function answerQ(i) {
    if (qz.answers[cur] !== null) return;
    qz.answers[cur] = i; saveQz(); showAnswerState();
    $('quizNext').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function renderResult() {
    const n = quizScore(), total = QUIZ.length;
    $('quizScore').textContent = `${n} dari ${total}`;
    $('quizMsg').textContent = n === total ? 'Sempurna! Pemahamanmu tentang struktur dan replikasi virus sangat kuat.'
      : n >= 3 ? 'Bagus! Sebagian besar konsep sudah kamu kuasai. Tinjau soal yang masih keliru pada daftar di bawah.'
      : 'Kamu sudah memulai, dan itu yang terpenting. Baca lagi fase Explore dan Explain, lalu coba lagi.';
    const list = $('quizReview');
    list.textContent = '';
    QUIZ.forEach((Q, i) => {
      const right = qz.answers[i] === Q.ans, li = el('li');
      li.append(el('span', right ? 'ok' : 'bad', right ? '\u2713 Tepat' : '\u2717 Perlu ditinjau'), document.createTextNode(` \u2013 Soal ${i + 1}: ${Q.topic}`));
      list.appendChild(li);
    });
    $('quizBest').textContent = qz.best !== null ? `Skor terbaikmu: ${qz.best} dari ${total}` : '';
  }
  $('quizNext').addEventListener('click', () => {
    if (cur < QUIZ.length - 1) { cur++; renderQuiz(true); }
    else {
      qz.done = true; qz.best = Math.max(qz.best === null ? 0 : qz.best, quizScore()); saveQz();
      renderQuiz();
      $('quizResult').scrollIntoView({ block: 'start' });
    }
  });
  $('quizRetry').addEventListener('click', () => {
    qz.answers = Array(QUIZ.length).fill(null); qz.done = false; saveQz(); cur = 0;
    renderQuiz(true);
    $('quizBox').scrollIntoView({ block: 'start' });
  });
  function resetEvaluate() {
    qz = { answers: Array(QUIZ.length).fill(null), done: false, best: null }; cur = 0;
    try { localStorage.removeItem(QZ_KEY); } catch (e) { /* abaikan */ }
    renderQuiz();
  }

  // ---- Fase 6: Refleksi (jurnal, lencana, confetti) ----
  const RF_KEY = 'virus5e:refleksi:v1';
  const RF_IDS = ['jr1', 'jr2', 'jr3'];
  function fillJournal() {
    let r = {};
    try { r = JSON.parse(localStorage.getItem(RF_KEY)) || {}; } catch (e) { /* abaikan */ }
    RF_IDS.forEach(k => { $(k).value = typeof r[k] === 'string' ? r[k] : ''; });
  }
  RF_IDS.forEach(k => $(k).addEventListener('input', () => {
    const d = {}; RF_IDS.forEach(x => { d[x] = $(x).value; });
    try { localStorage.setItem(RF_KEY, JSON.stringify(d)); } catch (e) { /* abaikan */ }
  }));
  function resetRefleksi() {
    try { localStorage.removeItem(RF_KEY); } catch (e) { /* abaikan */ }
    fillJournal();
  }
  function renderBadge() {
    const note = $('badgeNote');
    note.hidden = !qz.done;
    if (qz.done) note.textContent = `Skor kuismu: ${quizScore()} dari ${QUIZ.length}`;
  }
  let confettiRaf = 0;
  function launchConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('confetti'), ctx = cv.getContext('2d');
    cancelAnimationFrame(confettiRaf);
    cv.width = window.innerWidth; cv.height = window.innerHeight; cv.hidden = false;
    const colors = PHASES.slice(1).map(p => p.color).concat('#F1C40F');
    const ps = Array.from({ length: 140 }, () => ({
      x: Math.random() * cv.width, y: -Math.random() * cv.height * 0.5 - 10,
      vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, s: 6 + Math.random() * 6,
      r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, c: colors[Math.floor(Math.random() * colors.length)]
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      let alive = false;
      ps.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.r += p.vr;
        if (p.y < cv.height + 20) alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); ctx.restore();
      });
      if (alive && t - t0 < 5000) confettiRaf = requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, cv.width, cv.height); cv.hidden = true; }
    })(t0);
  }
  $('btnConfetti').addEventListener('click', launchConfetti);

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
      resetElaborate();
      resetEvaluate();
      resetRefleksi();
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
  $('applyAns').value = loadEl(); updateApply();
  renderQuiz(); fillJournal();
  const hashIdx = PHASES.findIndex(p => '#' + p.id === location.hash);
  goTo(hashIdx !== -1 ? hashIdx : state.current, true);
})();
