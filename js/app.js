import { Roulette } from './roulette.js';
import { buildPreset, compressImage, downloadJson, exportOptions, importOptions, loadPreset, loadPresetIndex, loadPublishedConfig, newId, readPrefs, savePrefs } from './storage.js';
import { setupAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const wheel = new Roulette($('wheel'));
const wheelA = new Roulette($('wheel-a'));
const wheelB = new Roulette($('wheel-b'));
let state = { options: [], history: [], activePreset: null, scores: {}, duel: null };
let published = { version: null, options: [], music: null };
let prefs = { removeDrawn: true, mode: 'individual', duel: 'list', teams: [] };
let presets = [];
let spinning = false;
let previewUrl = null;
let toastTimer;

const TEAM_COLORS = ['#e6a18a', '#b8dd92', '#8da6d8', '#e7c987', '#ad91d0', '#80c5bb', '#df9eaf', '#b8bbef'];

function teams() {
  return Array.isArray(prefs.teams) ? prefs.teams : [];
}

function needsTeams() {
  return prefs.mode === 'equipos' || prefs.mode === 'supervivencia' || (prefs.mode === 'duelo' && prefs.duel === 'own');
}

function colorOf(teamId) {
  const team = teams().find((item) => item.id === teamId);
  if (team?.color) return team.color;
  const index = teams().findIndex((item) => item.id === teamId);
  return index >= 0 ? TEAM_COLORS[index % TEAM_COLORS.length] : '#555b73';
}

function notify(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function remainingOptions() {
  const drawn = new Set(state.history);
  return state.options.filter((option) => !drawn.has(option.id));
}

function thumbnail(option, className) {
  if (option.image) {
    const image = document.createElement('img');
    image.className = className;
    image.src = option.image;
    image.alt = '';
    return image;
  }
  const placeholder = document.createElement('span');
  placeholder.className = className === 'option-image' ? 'option-placeholder' : 'result-placeholder';
  placeholder.textContent = option.name.slice(0, 1).toUpperCase();
  return placeholder;
}

function emptyMessage(text) {
  const message = document.createElement('p');
  message.className = 'empty-list';
  message.textContent = text;
  return message;
}

function renderOptions() {
  const list = $('options-list');
  list.replaceChildren();
  $('total-count').textContent = state.options.length;
  if (!state.options.length) {
    list.append(emptyMessage('Todavía no hay opciones. Añade la primera arriba.'));
    return;
  }
  const drawn = new Set(state.history);
  state.options.forEach((option) => {
    const row = document.createElement('div');
    row.className = `option-row${drawn.has(option.id) ? ' is-drawn' : ''}`;
    row.append(thumbnail(option, 'option-image'));
    const info = document.createElement('div');
    info.className = 'option-info';
    const name = document.createElement('strong');
    name.textContent = option.name;
    const parts = [drawn.has(option.id) ? 'YA HA SALIDO' : 'EN JUEGO'];
    if (needsTeams() && option.team) {
      const team = teams().find((item) => item.id === option.team);
      if (team) parts.push(team.name.toUpperCase());
    }
    if (prefs.mode === 'duelo' && prefs.duel === 'number') parts.push(`Nº ${option.score}`);
    const status = document.createElement('small');
    status.textContent = parts.join(' · ');
    info.append(name, status);
    row.append(info);

    if (needsTeams()) {
      const select = document.createElement('select');
      select.className = 'option-team-select';
      select.disabled = spinning;
      select.setAttribute('aria-label', `Equipo de ${option.name}`);
      const sinEquipo = document.createElement('option');
      sinEquipo.value = '';
      sinEquipo.textContent = '—';
      select.append(sinEquipo);
      teams().forEach((team) => {
        const item = document.createElement('option');
        item.value = team.id;
        item.textContent = team.name;
        if (option.team === team.id) item.selected = true;
        select.append(item);
      });
      select.style.borderLeftColor = colorOf(option.team);
      select.addEventListener('change', () => {
        update({ ...state, options: state.options.map((item) => item.id === option.id ? { ...item, team: select.value || null } : item) });
      });
      row.append(select);
    }

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-button';
    edit.textContent = '✎';
    edit.title = 'Cambiar nombre';
    edit.setAttribute('aria-label', `Cambiar nombre de ${option.name}`);
    edit.disabled = spinning;
    edit.addEventListener('click', () => {
      const name = window.prompt('Nuevo nombre:', option.name);
      if (name === null || !name.trim()) return;
      update({ ...state, options: state.options.map((item) => item.id === option.id ? { ...item, name: name.trim().slice(0, 40) } : item), activePreset: null });
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button delete';
    remove.textContent = '×';
    remove.title = 'Eliminar opción';
    remove.setAttribute('aria-label', `Eliminar ${option.name}`);
    remove.disabled = spinning;
    remove.addEventListener('click', () => {
      $('result').hidden = true;
      update({ options: state.options.filter((item) => item.id !== option.id), history: state.history.filter((id) => id !== option.id), activePreset: null });
    });
    row.append(edit, remove);
    list.append(row);
  });
}

function renderHistory() {
  const list = $('history-list');
  list.replaceChildren();
  $('history-count').textContent = state.history.length;
  if (!state.history.length) {
    list.append(emptyMessage('Aquí aparecerán las opciones que salgan en cada tirada.'));
    return;
  }
  state.history.forEach((id, index) => {
    const option = state.options.find((item) => item.id === id);
    if (!option) return;
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    const number = document.createElement('span');
    number.className = 'history-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = option.name;
    entry.append(number, thumbnail(option, 'option-image'), name);
    list.append(entry);
  });
}

function renderScoreboard() {
  const box = $('scoreboard');
  const relevant = prefs.mode === 'equipos' || prefs.mode === 'supervivencia' || (prefs.mode === 'duelo' && prefs.duel === 'own');
  box.replaceChildren();
  box.hidden = !relevant || !teams().length;
  if (box.hidden) return;
  const drawn = new Set(state.history);
  const rows = teams().map((team) => {
    const owned = state.options.filter((option) => option.team === team.id);
    const alive = owned.filter((option) => !drawn.has(option.id)).length;
    const turns = state.scores[team.id] ?? 0;
    return { ...team, turns, alive, total: owned.length };
  });
  const leader = [...rows].sort((a, b) => b.turns - a.turns)[0];
  const header = document.createElement('p');
  header.className = 'score-hint';
  header.textContent = 'Tiros por equipo';
  box.append(header);
  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = `score-row${row === leader && row.turns > 0 ? ' is-leader' : ''}`;
    const dot = document.createElement('span');
    dot.className = 'score-dot';
    dot.style.background = colorOf(row.id);
    const name = document.createElement('span');
    name.className = 'score-name';
    name.textContent = row.name;
    const alive = document.createElement('span');
    alive.className = 'score-alive';
    alive.textContent = `${row.alive} de ${row.total}`;
    const turns = document.createElement('span');
    turns.className = 'score-turns';
    turns.textContent = String(row.turns);
    item.append(dot, name, alive, turns);
    box.append(item);
  });
}

function renderDuelResult() {
  const box = $('duel-result');
  box.replaceChildren();
  const duel = state.duel;
  box.hidden = prefs.mode !== 'duelo' || !duel;
  if (box.hidden) return;
  const label = document.createElement('small');
  label.textContent = 'RESULTADO';
  const title = document.createElement('strong');
  title.textContent = duel.winner;
  box.append(label, title);
}

function renderTeamsEditor() {
  $('teams-card').hidden = !needsTeams();
  const editor = $('team-editor');
  editor.replaceChildren();
  teams().forEach((team) => {
    const row = document.createElement('div');
    row.className = 'team-row';
    const dot = document.createElement('span');
    dot.className = 'team-dot';
    dot.style.background = colorOf(team.id);
    const name = document.createElement('input');
    name.className = 'team-name-input';
    name.type = 'text';
    name.maxLength = 18;
    name.value = team.name;
    name.disabled = spinning;
    name.setAttribute('aria-label', `Nombre de ${team.name}`);
    name.addEventListener('change', () => {
      const value = name.value.trim();
      if (!value) { name.value = team.name; return; }
      prefs.teams = teams().map((item) => item.id === team.id ? { ...item, name: value } : item);
      savePrefs(prefs);
      render();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button delete';
    remove.textContent = '×';
    remove.title = 'Eliminar equipo';
    remove.disabled = spinning;
    remove.addEventListener('click', () => {
      prefs.teams = teams().filter((item) => item.id !== team.id);
      savePrefs(prefs);
      state = { ...state, options: state.options.map((option) => option.team === team.id ? { ...option, team: null } : option), scores: {} };
      render();
    });
    row.append(dot, name, remove);
    editor.append(row);
  });
  const select = $('option-team');
  select.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'Sin equipo';
  select.append(none);
  teams().forEach((team) => {
    const item = document.createElement('option');
    item.value = team.id;
    item.textContent = team.name;
    select.append(item);
  });
  $('option-team-field').hidden = !needsTeams();
  select.hidden = !needsTeams();
  $('option-number-field').hidden = !(prefs.mode === 'duelo' && prefs.duel === 'number');
  $('option-number').hidden = !(prefs.mode === 'duelo' && prefs.duel === 'number');
  $('team-count').textContent = teams().length;
}

function renderModeBar() {
  document.querySelectorAll('.mode-button').forEach((button) => {
    const active = button.dataset.mode === prefs.mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.duel-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.duel === prefs.duel);
  });
  $('duel-bar').hidden = prefs.mode !== 'duelo';
}

function render() {
  const remaining = remainingOptions();
  $('remaining-count').textContent = remaining.length;
  $('spin-button').disabled = spinning || !remaining.length;
  $('spin-button').firstChild.textContent = spinning ? 'GIRANDO... ' : prefs.mode === 'duelo' ? 'TIRAR DUELO ' : 'GIRAR RULETA ';
  $('remove-drawn').disabled = spinning;
  const forcedOff = prefs.mode === 'supervivencia' || (prefs.mode === 'duelo' && prefs.duel === 'own');
  if (forcedOff) $('remove-drawn').checked = true;
  $('remove-drawn-hint').textContent = forcedOff
    ? (prefs.mode === 'supervivencia' ? 'Siempre se retiran: gana el último' : 'Siempre se retiran tras el duelo')
    : prefs.removeDrawn
      ? 'Cada opción sale una sola vez por ronda'
      : 'Las opciones pueden volver a salir';
  $('spin-hint').textContent = spinning
    ? 'La suerte está echada...'
    : !remaining.length && state.options.length
      ? 'Ronda completada. Reinicia para volver a jugar.'
      : !state.options.length
        ? 'Personaliza tus opciones para empezar.'
        : prefs.mode === 'equipos'
          ? 'Cada tiro suma un turno al equipo de la opción.'
          : prefs.mode === 'supervivencia'
            ? 'Se eliminan hasta que solo quede un superviviente.'
        : prefs.mode === 'duelo'
          ? prefs.duel === 'own'
            ? (splitByTeam().a.length && splitByTeam().b.length
                ? 'Cada ruleta gira con las opciones de su jugador.'
                : 'Asigna opciones a los dos jugadores en el panel de equipos.')
            : 'Dos tiradas seguidas para resolver el duelo.'
              : prefs.removeDrawn
                ? 'Cada resultado se retira de las siguientes tiradas.'
                : 'Puedes volver a salir la misma opción.';
  $('add-button').disabled = spinning;
  $('round-actions').hidden = !state.history.length;
  $('reset-button').hidden = !state.history.length;
  $('undo-button').hidden = !state.history.length;
  $('reset-button').disabled = spinning;
  $('undo-button').disabled = spinning;
  $('restore-button').disabled = spinning;
  $('export-button').disabled = spinning || !state.options.length;
  $('save-preset-button').disabled = spinning || !state.options.length;
  $('team-add').disabled = spinning || teams().length >= 12;
  $('remove-drawn').disabled = spinning || prefs.mode === 'supervivencia' || (prefs.mode === 'duelo' && prefs.duel === 'own');
  renderModeBar();
  renderWheels();
  renderOptions();
  renderHistory();
  renderPresets();
  renderTeamsEditor();
  renderScoreboard();
  renderDuelResult();
}

function splitByTeam() {
  const alive = remainingOptions();
  const primero = teams()[0];
  const segundo = teams()[1];
  const conEquipo = alive.filter((option) => option.team);
  return {
    a: conEquipo.filter((option) => option.team === primero?.id),
    b: conEquipo.filter((option) => option.team === segundo?.id)
  };
}

function renderWheels() {
  const duo = prefs.mode === 'duelo' && prefs.duel === 'own';
  $('wheel-duo').hidden = !duo;
  $('wheel-single').hidden = duo;
  if (!duo) {
    wheel.setOptions(remainingOptions());
    return;
  }
  const { a, b } = splitByTeam();
  $('wheel-caption-a').textContent = teams()[0]?.name ?? 'Jugador 1';
  $('wheel-caption-b').textContent = teams()[1]?.name ?? 'Jugador 2';
  $('wheel-caption-a').style.color = colorOf(teams()[0]?.id);
  $('wheel-caption-b').style.color = colorOf(teams()[1]?.id);
  wheelA.setOptions(a);
  wheelB.setOptions(b);
  requestAnimationFrame(() => {
    wheelA.resize();
    wheelB.resize();
  });
}

function update(next) {
  state = next;
  render();
}

function renderPresets() {
  const card = $('preset-card');
  card.hidden = !presets.length;
  const list = $('preset-list');
  list.replaceChildren();
  if (!presets.length) return;
  presets.forEach((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `preset-item${state.activePreset === preset.id ? ' is-active' : ''}`;
    button.disabled = spinning;
    const title = document.createElement('strong');
    title.textContent = preset.name;
    button.append(title);
    if (preset.description) {
      const description = document.createElement('small');
      description.textContent = preset.description;
      button.append(description);
    }
    const badge = document.createElement('span');
    badge.className = 'preset-badge';
    badge.textContent = state.activePreset === preset.id ? 'CARGADO' : 'CARGAR';
    button.append(badge);
    button.addEventListener('click', () => applyPreset(preset));
    list.append(button);
  });
}

async function applyPreset(preset) {
  if (spinning) return;
  const loading = $('spin-button');
  loading.disabled = true;
  try {
    const data = await loadPreset(preset.file);
    $('result').hidden = true;
    $('duel-result').hidden = true;
    prefs = { ...prefs, ...data.settings, teams: data.teams.length ? data.teams : prefs.teams };
    savePrefs(prefs);
    state = { options: data.options, history: [], scores: {}, duel: null, activePreset: preset.id };
    if (data.music.src) await audioControls.setTrack(data.music, data.name);
    render();
    notify(`${data.name} cargado: ${data.options.length} opciones.`);
  } catch (error) {
    notify(error.message || 'No se ha podido cargar el preset.');
  } finally {
    render();
  }
}

$('save-preset-button').addEventListener('click', () => {
  if (spinning || !state.options.length) return;
  const suggested = (state.activePreset ?? 'mi-preset').replace(/[^\w-]+/g, '-').slice(0, 30);
  const name = window.prompt('Nombre del preset:', suggested);
  if (name === null) return;
  const description = window.prompt('Descripción corta (opcional):', '') ?? '';
  const track = audioControls.getTrack();
  if (!track.src) {
    notify('Esta sesión usa un MP3 local, que no se puede guardar. Usa una canción del repositorio para incluirla en el preset.');
  }
  downloadJson(`${name.trim().replace(/[^\w-]+/g, '-').slice(0, 30) || 'preset'}.json`, buildPreset(name.trim(), description.trim(), state.options, { src: track.src, volume: track.volume, autoplay: true }, prefs));
  notify('Preset descargado. Ejecútalo en guardar-preset.ps1 para publicarlo en el repositorio.');
});

function randomScore() {
  return 1 + Math.floor(Math.random() * 99);
}

function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('upload-preview').hidden = true;
  $('upload-preview').removeAttribute('src');
  $('upload-text').hidden = false;
  $('image-file').value = '';
}

$('settings-toggle').addEventListener('click', () => {
  const open = document.documentElement.classList.toggle('settings-open');
  $('settings-toggle').setAttribute('aria-expanded', String(open));
  $('settings-toggle').firstChild.textContent = open ? 'CERRAR OPCIONES ' : 'PERSONALIZAR OPCIONES ';
  wheel.resize();
  wheelA.resize();
  wheelB.resize();
});

$('image-file').addEventListener('change', () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  const file = $('image-file').files[0];
  if (!file) {
    clearPreview();
    return;
  }
  previewUrl = URL.createObjectURL(file);
  $('upload-preview').src = previewUrl;
  $('upload-preview').hidden = false;
  $('upload-text').hidden = false;
  $('upload-text').querySelector('strong').textContent = file.name;
  $('upload-text').querySelector('small').textContent = 'Se reducirá al añadirla';
});

$('option-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (spinning) return;
  const file = $('image-file').files[0];
  const url = $('image-url').value.trim();
  const name = $('option-name').value.trim();
  if (!file && !url && !name) {
    notify('Añade una imagen, una URL o un nombre.');
    return;
  }
  $('add-button').disabled = true;
  try {
    let image = '';
    if (file) image = await compressImage(file);
    else if (url) {
      const parsed = new URL(url, location.href);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('La URL de la imagen debe ser HTTP, HTTPS o una ruta local.');
      image = url;
    }
    const option = { id: newId(), name: name || `Opción ${state.options.length + 1}`, image, team: needsTeams() ? $('option-team').value || null : null, score: randomScore() };
    state = { ...state, options: [...state.options, option], activePreset: null };
    $('option-form').reset();
    clearPreview();
    $('upload-text').querySelector('strong').textContent = 'Elige una imagen';
    $('upload-text').querySelector('small').textContent = 'JPG, PNG, WebP o GIF · máx. 12 MB';
    $('result').hidden = true;
    render();
    notify('Opción añadida.');
  } catch (error) {
    notify(error.message || 'No se ha podido añadir la opción.');
  } finally {
    $('add-button').disabled = false;
  }
});

$('remove-drawn').addEventListener('change', (event) => {
  prefs.removeDrawn = event.target.checked;
  savePrefs(prefs);
  if (!prefs.removeDrawn && state.history.length) {
    $('result').hidden = true;
    update({ ...state, history: [] });
    notify('Las opciones vuelven a poder repetirse.');
  } else {
    render();
  }
});

document.querySelectorAll('.mode-button').forEach((button) => {
  button.addEventListener('click', () => {
    if (spinning || prefs.mode === button.dataset.mode) return;
    prefs.mode = button.dataset.mode;
    savePrefs(prefs);
    $('result').hidden = true;
    $('duel-result').hidden = true;
    state = { ...state, history: [], scores: {}, duel: null };
    render();
    notify(`Modo ${button.textContent.toLowerCase()}.`);
  });
});

document.querySelectorAll('.duel-button').forEach((button) => {
  button.addEventListener('click', () => {
    if (spinning || prefs.duel === button.dataset.duel) return;
    prefs.duel = button.dataset.duel;
    savePrefs(prefs);
    $('result').hidden = true;
    $('duel-result').hidden = true;
    state = { ...state, history: [], scores: {}, duel: null };
    render();
  });
});

$('team-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('team-name');
  const name = input.value.trim();
  if (!name || teams().length >= 12) return;
  const id = newId();
  prefs.teams = [...teams(), { id, name, color: TEAM_COLORS[teams().length % TEAM_COLORS.length] }];
  savePrefs(prefs);
  input.value = '';
  render();
});

$('spin-button').addEventListener('click', async () => {
  if (spinning) return;
  if (prefs.mode === 'duelo') {
    await spinDuel();
    return;
  }
  const remaining = remainingOptions();
  if (!remaining.length) return;
  audioControls.startOnSpin();
  spinning = true;
  $('result').hidden = true;
  render();
  const index = Math.floor(Math.random() * remaining.length);
  const winner = remaining[index];
  await wheel.spin(index);
  showResult(winner);
  await new Promise((resolve) => setTimeout(resolve, 850));
  spinning = false;
  const remove = prefs.removeDrawn || prefs.mode === 'supervivencia';
  const scores = { ...state.scores };
  if (prefs.mode === 'equipos' && winner.team) scores[winner.team] = (scores[winner.team] ?? 0) + 1;
  update({ ...state, history: remove ? [...state.history, winner.id] : state.history, scores });
});
function showResult(winner) {
  const result = $('result');
  const text = document.createElement('div');
  const label = document.createElement('small');
  label.textContent = 'HA SALIDO';
  const name = document.createElement('strong');
  name.textContent = winner.name;
  text.append(label, name);
  if (prefs.mode === 'duelo' && prefs.duel === 'number') {
    const score = document.createElement('em');
    score.className = 'result-score';
    score.textContent = `Nº ${winner.score}`;
    text.append(score);
  }
  result.replaceChildren(thumbnail(winner, 'result-image'), text);
  result.hidden = false;
}

async function spinDuel() {
  if (prefs.duel === 'own') {
    await spinOwnWheels();
    return;
  }
  const pool = duelPool();
  if (!pool.length) {
    notify('No hay opciones para tirar. Añade opciones al duel.');
    return;
  }
  spinning = true;
  $('result').hidden = true;
  $('duel-result').hidden = true;
  render();

  const firstIndex = Math.floor(Math.random() * pool.length);
  const first = pool[firstIndex];
  await wheel.spin(firstIndex);
  showResult(first);

  let secondPool = pool;
  if (prefs.duel !== 'number' && pool.length > 1) {
    secondPool = pool.filter((option) => option.id !== first.id);
  }
  const secondIndex = Math.floor(Math.random() * secondPool.length);
  const second = secondPool[secondIndex];
  await wheel.spin(secondIndex);
  showResult(second);

  await new Promise((resolve) => setTimeout(resolve, 500));
  const scores = { ...state.scores };
  const bump = (option) => {
    if (!option?.team) return;
    scores[option.team] = (scores[option.team] ?? 0) + 1;
  };
  let winner;
  if (prefs.duel === 'number') {
    const a = first.score ?? 0;
    const b = second.score ?? 0;
    if (a > b) { bump(first); winner = `${first.name} gana (Nº ${a} contra ${b})`; }
    else if (b > a) { bump(second); winner = `${second.name} gana (Nº ${b} contra ${a})`; }
    else winner = `Empate a Nº ${a}`;
  } else if (prefs.duel === 'own') {
    const teamA = teams().find((team) => team.id === first.team)?.name;
    const teamB = teams().find((team) => team.id === second.team)?.name;
    winner = `${first.name}${teamA ? ` (${teamA})` : ''} contra ${second.name}${teamB ? ` (${teamB})` : ''}`;
  } else {
    bump(first);
    bump(second);
    winner = `${first.name} contra ${second.name}`;
  }

  const remove = prefs.duel === 'number' ? [first.id, second.id] : [first.id, second.id];
  const history = [...state.history, ...remove.filter((id, index, all) => all.indexOf(id) === index)];
  state = { ...state, history, scores, duel: { winner, a: first.name, b: second.name } };
  spinning = false;
  update(state);
}

function duelPool() {
  return remainingOptions();
}

async function spinOwnWheels() {
  const { a, b } = splitByTeam();
  if (!a.length || !b.length) {
    const faltan = [];
    if (!a.length) faltan.push(teams()[0]?.name ?? 'Jugador 1');
    if (!b.length) faltan.push(teams()[1]?.name ?? 'Jugador 2');
    notify(`${faltan.join(' y ')} no tiene opciones asignadas.`);
    return;
  }
  spinning = true;
  $('result').hidden = true;
  $('duel-result').hidden = true;
  render();

  const indexA = Math.floor(Math.random() * a.length);
  const indexB = Math.floor(Math.random() * b.length);
  const first = a[indexA];
  const second = b[indexB];

  await Promise.all([wheelA.spin(indexA), wheelB.spin(indexB)]);

  const scores = { ...state.scores };
  if (first.team) scores[first.team] = (scores[first.team] ?? 0) + 1;
  if (second.team) scores[second.team] = (scores[second.team] ?? 0) + 1;

  const history = [...state.history, first.id, second.id];
  const teamA = teams().find((team) => team.id === first.team)?.name ?? '';
  const teamB = teams().find((team) => team.id === second.team)?.name ?? '';
  state = {
    ...state,
    history,
    scores,
    duel: { winner: `${teamA}: ${first.name}  ·  ${teamB}: ${second.name}`, a: first.name, b: second.name }
  };
  spinning = false;
  update(state);
}

$('undo-button').addEventListener('click', () => {
  if (spinning || !state.history.length) return;
  const lastId = state.history[state.history.length - 1];
  const restored = state.options.find((option) => option.id === lastId);
  $('result').hidden = true;
  update({ ...state, history: state.history.slice(0, -1) });
  notify(`${restored?.name ?? 'La opción'} vuelve a participar.`);
});

$('reset-button').addEventListener('click', () => {
  if (spinning || !state.history.length) return;
  if (!window.confirm('¿Reiniciar la ronda? Todas las opciones volverán a participar.')) return;
  $('result').hidden = true;
  update({ ...state, history: [] });
  notify('Ronda reiniciada.');
});

$('restore-button').addEventListener('click', () => {
  if (spinning) return;
  if (!window.confirm('¿Volver a las opciones publicadas en config.json?')) return;
  $('result').hidden = true;
  update({ options: [...published.options], history: [], scores: {}, duel: null, activePreset: null });
  notify('Vueltas a las opciones publicadas.');
});

$('export-button').addEventListener('click', () => {
  if (!spinning && state.options.length) exportOptions(state.options);
});

$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || spinning) return;
  try {
    const options = await importOptions(file);
    if (spinning || !window.confirm('¿Sustituir las opciones actuales por las del archivo?')) return;
    state = { options, history: [], scores: {}, duel: null, activePreset: null };
    $('result').hidden = true;
    render();
    notify(`${options.length} opciones importadas.`);
  } catch (error) {
    notify(error.message || 'No se ha podido importar el archivo.');
  }
});

published = await loadPublishedConfig();
const audioControls = setupAudio(notify, published.music);
prefs = readPrefs();
$('remove-drawn').checked = prefs.removeDrawn;
state = { options: [...published.options], history: [], scores: {}, duel: null, activePreset: null };
presets = await loadPresetIndex();
render();
