const EMOJIS = [
  '🦊','🐼','🐨','🦁','🐯','🐸','🐵','🦄','🐧','🐦',
  '🐙','🦋','🐞','🐝','🐳','🐬','🦈','🐊','🦎','🐍',
  '🐉','🦒','🐘','🦏','🦙','🐶','🐱','🐭','🐹','🐰',
  '🐻','🦖','🦜','🦩','🦭','🦔','🐲','🐆','🦓','🐿️'
];

const MAX_PLAYERS = 10;
const MIN_PLAYERS = 2;
const MAX_IMPOSTORS = 5;

const $ = id => document.getElementById(id);

const state = {
  players: [],
  settings: { timer: 0, impostors: 1, showHint: true },
  categories: [],
  currentWord: null,
  impostorIndices: [],
  distributionOrder: [],
  currentDistIndex: 0,
  distStage: 'reveal',
  timerInterval: null,
  timeRemaining: 0,
  timerDuration: 0,
  darkMode: false,
  emojiTarget: null,
};

function init() {
  state.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme();
  setupListeners();
  loadCategories();
  renderPlayers();
  updateStartButton();
  renderSettings();
  registerSW();
}

function setupListeners() {
  $('theme-toggle').addEventListener('click', toggleTheme);
  $('add-player-btn').addEventListener('click', () => addPlayer());
  $('player-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });
  $('start-game-btn').addEventListener('click', startGame);
  $('impostors-minus').addEventListener('click', () => changeImpostors(-1));
  $('impostors-plus').addEventListener('click', () => changeImpostors(1));
  $('timer-setting').addEventListener('change', () => {
    state.settings.timer = parseInt($('timer-setting').value);
  });
  $('hint-toggle').addEventListener('change', () => {
    state.settings.showHint = $('hint-toggle').checked;
  });
  $('dist-confirm').addEventListener('click', handleDistAction);
  $('show-word-btn').addEventListener('click', showWordModal);
  $('show-hint-btn').addEventListener('click', showHintModal);
  $('end-game-btn').addEventListener('click', endGame);
  $('play-again-btn').addEventListener('click', playAgain);
  $('new-setup-btn').addEventListener('click', goToSetup);
  $('emoji-modal-close').addEventListener('click', hideModals);
  $('modal-word-close').addEventListener('click', hideModals);
  $('modal-hint-close').addEventListener('click', hideModals);
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) hideModals(); });
  });
}

async function loadCategories() {
  state.categories = [];
  const seen = new Set();
  function addCat(cat, words) {
    if (seen.has(cat.id)) return;
    seen.add(cat.id);
    state.categories.push({ ...cat, words, enabled: true });
  }
  async function tryLoad(file) {
    try {
      const r = await fetch(file + '?_=' + Date.now());
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }
  const KNOWN = [
    { id: 'facil', name: 'Fáciles', file: 'facil.json', icon: '📝' },
    { id: 'normal', name: 'Variadas', file: 'normal.json', icon: '🌞' },
  ];
  const meta = await tryLoad('categories.json');
  if (meta && Array.isArray(meta)) {
    for (const cat of meta) {
      const words = await tryLoad(cat.file);
      if (words) addCat(cat, words);
    }
  }
  if (state.categories.length === 0) {
    for (const guess of KNOWN) {
      const words = await tryLoad(guess.file);
      if (words) addCat(guess, words);
    }
  }
  if (state.categories.length === 0) {
    const words = await tryLoad('words.json');
    if (words) addCat({ id: 'words', name: 'Palabras', file: 'words.json', icon: '📝' }, words);
  }
  if (state.categories.length === 0) {
    addCat({ id: 'default', name: 'Palabras', file: '', icon: '📝' }, [
      { word: 'playa', hint: 'arena' },
      { word: 'guitarra', hint: 'cuerdas' },
      { word: 'elefante', hint: 'trompa' },
      { word: 'volcán', hint: 'lava' },
      { word: 'pirámide', hint: 'egipto' },
    ]);
  }
  renderCategories();
}

function renderCategories() {
  const list = $('categories-list');
  list.innerHTML = '';
  if (state.categories.length === 0) {
    list.innerHTML = '<p style="color:var(--text-secondary);font-size:14px;text-align:center;padding:8px 0;">No hay categorías disponibles</p>';
    $('categories-count').textContent = '';
    return;
  }
  const nEnabled = state.categories.filter(c => c.enabled).length;
  $('categories-count').textContent = `(${nEnabled}/${state.categories.length} seleccionadas)`;
  for (let i = 0; i < state.categories.length; i++) {
    const cat = state.categories[i];
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `
      <span class="setting-label"><span class="emoji">${cat.icon || '📂'}</span> ${escHtml(cat.name)} <span style="font-size:12px;color:var(--text-secondary);">${cat.words.length} palabras</span></span>
      <label class="toggle">
        <input type="checkbox" ${cat.enabled ? 'checked' : ''} data-index="${i}">
        <span class="slider"></span>
      </label>
    `;
    row.querySelector('input').addEventListener('change', function () {
      state.categories[i].enabled = this.checked;
      renderCategories();
    });
    list.appendChild(row);
  }
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ===== THEME ===== */
function toggleTheme() {
  state.darkMode = !state.darkMode;
  applyTheme();
}

function applyTheme() {
  document.body.classList.toggle('dark', state.darkMode);
  $('theme-toggle').textContent = state.darkMode ? '☀️' : '🌙';
}

/* ===== PLAYERS ===== */
function addPlayer(name) {
  if (state.players.length >= MAX_PLAYERS) return;
  name = (name || $('player-name-input').value || '').trim();
  if (!name) {
    const base = 'Jugador';
    let i = 1;
    while (state.players.some(p => p.name === `${base} ${i}`)) i++;
    name = `${base} ${i}`;
  }
  const used = state.players.map(p => p.emoji);
  const avail = EMOJIS.find(e => !used.includes(e)) || EMOJIS[state.players.length % EMOJIS.length];
  state.players.push({ name, emoji: avail });
  $('player-name-input').value = '';
  $('player-name-input').focus();
  renderPlayers();
  updateStartButton();
  renderSettings();
}

function removePlayer(index) {
  if (state.players.length <= 1) return;
  state.players.splice(index, 1);
  renderPlayers();
  updateStartButton();
  renderSettings();
}

function openEmojiPicker(index) {
  state.emojiTarget = index;
  const grid = $('emoji-grid');
  grid.innerHTML = '';
  for (const e of EMOJIS) {
    const btn = document.createElement('button');
    btn.textContent = e;
    btn.addEventListener('click', () => {
      state.players[index].emoji = e;
      renderPlayers();
      hideModals();
    });
    grid.appendChild(btn);
  }
  showModal('modal-emoji');
}

function renderPlayers() {
  const list = $('player-list');
  list.innerHTML = '';
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.innerHTML = `
      <button class="emoji-btn" data-index="${i}">${p.emoji}</button>
      <span class="name">${escHtml(p.name)}</span>
      <button class="remove-btn" data-index="${i}">✕</button>
    `;
    chip.querySelector('.emoji-btn').addEventListener('click', () => openEmojiPicker(i));
    chip.querySelector('.remove-btn').addEventListener('click', () => removePlayer(i));
    list.appendChild(chip);
  }
  const n = state.players.length;
  $('player-count-badge').textContent = `(${n}/${MAX_PLAYERS})`;
  $('add-player-btn').disabled = n >= MAX_PLAYERS;
}

function updateStartButton() {
  const btn = $('start-game-btn');
  const n = state.players.length;
  btn.disabled = n < MIN_PLAYERS;
  btn.textContent = n < MIN_PLAYERS
    ? `👥 Necesitas ${MIN_PLAYERS} jugadores`
    : `🎮 ¡Empezar! (${n} jugadores)`;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ===== SETTINGS ===== */
function changeImpostors(delta) {
  let v = state.settings.impostors + delta;
  v = Math.max(1, Math.min(MAX_IMPOSTORS, v));
  const maxFromPlayers = Math.max(1, state.players.length - 1);
  v = Math.min(v, maxFromPlayers);
  state.settings.impostors = v;
  renderSettings();
}

function renderSettings() {
  $('impostors-count').textContent = state.settings.impostors;
  const maxFromPlayers = Math.max(1, state.players.length - 1);
  $('impostors-minus').disabled = state.settings.impostors <= 1;
  $('impostors-plus').disabled = state.settings.impostors >= Math.min(MAX_IMPOSTORS, maxFromPlayers);
  $('timer-setting').value = state.settings.timer;
  $('hint-toggle').checked = state.settings.showHint;
}

/* ===== GAME FLOW ===== */
function startGame() {
  if (state.players.length < MIN_PLAYERS) return;
  const active = state.categories.filter(c => c.enabled);
  if (active.length === 0) {
    alert('Selecciona al menos una categoría');
    return;
  }
  const all = active.flatMap(c => c.words);
  if (all.length === 0) {
    alert('No hay palabras disponibles en las categorías seleccionadas');
    return;
  }
  const wordEntry = all[Math.floor(Math.random() * all.length)];
  state.currentWord = wordEntry;
  const numImp = Math.min(state.settings.impostors, state.players.length - 1);
  const indices = [...Array(state.players.length).keys()];
  shuffle(indices);
  state.impostorIndices = indices.slice(0, numImp);
  state.distributionOrder = [...Array(state.players.length).keys()];
  shuffle(state.distributionOrder);
  state.currentDistIndex = 0;
  state.distStage = 'hidden';
  showScreen('screen-distribution');
  renderDistProgress();
  showDistHidden();
}

function showDistHidden() {
  state.distStage = 'hidden';
  const idx = state.distributionOrder[state.currentDistIndex];
  const player = state.players[idx];
  $('dist-emoji').textContent = player.emoji;
  $('dist-name').textContent = player.name;
  $('dist-reveal').innerHTML = `
    <div class="dist-hidden">
      <span style="font-size:48px;">👁️</span><br>
      <span style="font-size:16px;">Toca el botón para ver tu rol</span>
    </div>
  `;
  $('dist-confirm').textContent = '👁️ Ver mi palabra';
  $('dist-confirm').style.display = '';
  renderDistProgress();
}

function showDistRevealed() {
  state.distStage = 'revealed';
  const idx = state.distributionOrder[state.currentDistIndex];
  const player = state.players[idx];
  const isImpostor = state.impostorIndices.includes(idx);
  $('dist-emoji').textContent = player.emoji;
  $('dist-name').textContent = player.name;
  let html;
  if (isImpostor) {
    let hintHtml = '';
    if (state.settings.showHint) {
      hintHtml = `<div class="dist-hint">💡 Pista: <span>${escHtml(state.currentWord.hint)}</span></div>`;
    }
    html = `
      <div class="dist-role">🔍 Eres el Impostor</div>
      <div class="dist-word impostor">🕵️</div>
      ${hintHtml}
    `;
  } else {
    html = `
      <div class="dist-role">👑 Tu palabra es:</div>
      <div class="dist-word normal">${escHtml(state.currentWord.word)}</div>
    `;
  }
  $('dist-reveal').innerHTML = html;
  const isLast = state.currentDistIndex >= state.players.length - 1;
  $('dist-confirm').textContent = isLast ? '🎮 ¡Comenzar partida!' : '➡️ Siguiente jugador';
  $('dist-confirm').style.display = '';
  renderDistProgress();
}

function handleDistAction() {
  if (state.distStage === 'hidden') {
    playSound('confirm');
    showDistRevealed();
  } else if (state.distStage === 'revealed') {
    state.currentDistIndex++;
    if (state.currentDistIndex >= state.players.length) {
      startPlayPhase();
    } else {
      showDistHidden();
    }
  }
}

function renderDistProgress() {
  const p = $('dist-progress');
  p.innerHTML = '';
  for (let i = 0; i < state.players.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    if (i < state.currentDistIndex) dot.classList.add('done');
    if (i === state.currentDistIndex && state.distStage === 'revealed') dot.classList.add('current');
    p.appendChild(dot);
  }
}

/* ===== PLAY PHASE ===== */
function startPlayPhase() {
  showScreen('screen-game');
  const starterIdx = state.distributionOrder[Math.floor(Math.random() * state.players.length)];
  const starter = state.players[starterIdx];
  $('starter-name').textContent = `Empieza: ${starter.name} ${starter.emoji}`;
  $('show-hint-btn').style.display = state.settings.showHint ? '' : 'none';
  if (state.settings.timer > 0) {
    state.timerDuration = state.settings.timer * 60;
    state.timeRemaining = state.timerDuration;
    updateTimerDisplay();
    startTimer();
  } else {
    $('timer-display').innerHTML = '<span class="no-limit">♾️ Sin límite</span>';
    $('game-timer').classList.remove('urgent');
  }
}

function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.timeRemaining--;
    updateTimerDisplay();
    if (state.timeRemaining <= 10 && state.timeRemaining > 0) {
      $('game-timer').classList.add('urgent');
    }
    if (state.timeRemaining <= 0) {
      stopTimer();
      endGame();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimerDisplay() {
  const min = Math.floor(state.timeRemaining / 60);
  const sec = state.timeRemaining % 60;
  $('timer-display').textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/* ===== GAME ACTIONS ===== */
function showWordModal() {
  $('modal-word-text').textContent = state.currentWord.word;
  $('modal-word-hint').innerHTML = `💡 Pista: <strong>${escHtml(state.currentWord.hint)}</strong>`;
  showModal('modal-word');
}

function showHintModal() {
  if (!state.settings.showHint) return;
  $('modal-hint-text').textContent = state.currentWord.hint;
  showModal('modal-hint');
}

function endGame() {
  stopTimer();
  playSound('alarm');
  if (navigator.vibrate) {
    navigator.vibrate([300, 150, 300, 150, 600]);
  }
  showResults();
}

function showResults() {
  showScreen('screen-results');
  $('results-word').textContent = state.currentWord.word;
  const hintEl = $('results-hint');
  hintEl.textContent = `💡 ${state.currentWord.hint}`;
  const impostorList = $('results-impostor-list');
  impostorList.innerHTML = '';
  for (const idx of state.impostorIndices) {
    const p = state.players[idx];
    const el = document.createElement('div');
    el.className = 'results-impostor';
    el.textContent = `${p.emoji} ${escHtml(p.name)}`;
    impostorList.appendChild(el);
  }
  const honestList = $('results-honest-list');
  honestList.innerHTML = '';
  for (let i = 0; i < state.players.length; i++) {
    if (state.impostorIndices.includes(i)) continue;
    const p = state.players[i];
    const el = document.createElement('div');
    el.className = 'results-honest';
    el.textContent = `${p.emoji} ${escHtml(p.name)}`;
    honestList.appendChild(el);
  }
}

function playAgain() {
  if (state.players.length < MIN_PLAYERS) {
    goToSetup();
    return;
  }
  startGame();
}

function goToSetup() {
  stopTimer();
  showScreen('screen-setup');
}

/* ===== NAVIGATION ===== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  hideModals();
}

function showModal(id) {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
  $(id).classList.add('show');
}

function hideModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
}

/* ===== AUDIO ===== */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    if (type === 'confirm') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'alarm') {
      [800, 600, 800, 600, 1000].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'square';
        const t = ctx.currentTime + i * 0.3;
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    }
  } catch {}
}

/* ===== UTILITY ===== */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

document.addEventListener('DOMContentLoaded', init);
