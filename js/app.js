import { Roulette } from './roulette.js?v=9';
import { buildPreset, compressImage, downloadJson, exportOptions, importOptions, loadPreset, loadPresetIndex, loadPublishedConfig, newId, readPrefs, savePrefs } from './storage.js?v=9';
import { setupAudio } from './audio.js?v=9';

const $ = (id) => document.getElementById(id);
const wheel = new Roulette($('wheel'));
let state = { options: [], history: [], activePreset: null, scores: {}, duel: null, turn: 'a' };
let published = { version: null, options: [], music: null };
let prefs = { removeDrawn: true, mode: 'individual', duel: 'list', teams: [] };
let presets = [];
let spinning = false;
let previewUrl = null;
let toastTimer;
let lastTeamChoice = '';

const TEAM_COLORS = ['#e6a18a', '#b8dd92', '#8da6d8', '#e7c987', '#ad91d0', '#80c5bb', '#df9eaf', '#b8bbef'];

function teams() {
  return Array.isArray(prefs.teams) ? prefs.teams : [];
}

function needsTeams() {
  return prefs.mode === 'equipos' || prefs.mode === 'duelo';
}

// Equipos y el 1 vs 1 de ruletas propias giran por turnos:
// cada jugador solo ve y tira con sus propias opciones.
// En lista comun todos ven la misma lista, asi que el aviso de turno indica
// de quien es la proxima eleccion, pero la ruleta no se filtra.
function turnoPorEquipo() {
  return prefs.mode === 'equipos' || prefs.mode === 'duelo';
}

function ruletaFiltradaPorTurno() {
  return prefs.mode === 'equipos' || prefs.duel === 'own';
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
  const relevant = prefs.mode === 'equipos' || prefs.mode === 'duelo';
  box.replaceChildren();
  box.hidden = !relevant || !teams().length;
  if (box.hidden) return;
  const drawn = new Set(state.history);
  const rows = teams().map((team) => {
    const owned = state.options.filter((option) => option.team === team.id);
    const alive = owned.filter((option) => !drawn.has(option.id)).length;
    const turns = (state.scores ?? {})[team.id] ?? 0;
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
  const previo = lastTeamChoice;
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
  // Se mantiene el equipo que se estaba usando para no tener que elegirlo cada vez.
  if (previo && teams().some((team) => team.id === previo)) select.value = previo;
  $('option-team-field').hidden = !needsTeams();
  select.hidden = !needsTeams();
  $('team-count').textContent = teams().length;
}

$('option-team').addEventListener('change', (event) => {
  lastTeamChoice = event.target.value;
});

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
  $('spin-button').firstChild.textContent = spinning ? 'GIRANDO... ' : turnoPorEquipo() ? 'TIRAR ' : 'GIRAR RULETA ';
  $('remove-drawn').disabled = spinning;
  const forcedOff = prefs.mode === 'duelo' && prefs.duel === 'own';
  if (forcedOff) $('remove-drawn').checked = true;
  $('remove-drawn-hint').textContent = forcedOff
    ? 'Siempre se retiran tras el duelo'
    : prefs.removeDrawn
      ? 'Cada opción sale una sola vez por ronda'
      : 'Las opciones pueden volver a salir';

  let pista;
  if (spinning) pista = 'La suerte está echada...';
  else if (!remaining.length && state.options.length) pista = 'Ronda completada. Reinicia para volver a jugar.';
  else if (!state.options.length) pista = 'Personaliza tus opciones para empezar.';
  else if (prefs.mode === 'equipos') {
    const { a, b } = splitByTeam();
    const faltan = [];
    if (!a.length) faltan.push(teams()[0]?.name ?? 'Jugador 1');
    if (!b.length && prefs.removeDrawn) faltan.push(teams()[1]?.name ?? 'Jugador 2');
    pista = faltan.length
      ? `Asigna opciones a ${faltan.join(' y ')} en el panel de equipos.`
      : 'Turnos alternos: cada equipo tira con sus opciones.';
  } else if (prefs.mode === 'duelo') {
    pista = prefs.duel === 'own'
      ? 'Turnos alternos: cada jugador tira con sus opciones.'
      : 'Dos turnos seguidos sobre la misma lista para resolver el duelo.';
  } else if (prefs.removeDrawn) pista = 'Cada resultado se retira de las siguientes tiradas.';
  else pista = 'Puedes volver a salir la misma opción.';
  $('spin-hint').textContent = pista;
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
  const porTurnos = turnoPorEquipo();
  $('remove-drawn').disabled = spinning || (prefs.mode === 'duelo' && prefs.duel === 'own');
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

function turnoActual() {
  return state.turn === 'b' ? 'b' : 'a';
}

function nombreTurno() {
  const lista = teams();
  return lista[turnoActual() === 'a' ? 0 : 1]?.name ?? (turnoActual() === 'a' ? 'Jugador 1' : 'Jugador 2');
}

function renderWheels() {
  const porTurno = turnoPorEquipo();
  const banner = $('turn-banner');
  banner.hidden = !porTurno;
  if (!porTurno) {
    wheel.setOptions(remainingOptions());
    return;
  }
  const turno = turnoActual();
  $('turn-name').textContent = nombreTurno();
  $('turn-banner').querySelector('.turn-dot').style.background = colorOf(turno === 'a' ? teams()[0]?.id : teams()[1]?.id);
  if (!ruletaFiltradaPorTurno()) {
    // En lista comun todos ven lo mismo: el aviso indica de quien es la eleccion.
    wheel.setOptions(remainingOptions());
    return;
  }
  const { a, b } = splitByTeam();
  wheel.setOptions(turno === 'a' ? a : b);
}

function update(next) {
  // Se normaliza aqui para que ningun llamante pueda dejar el estado a medias:
  // antes, borrar una opcion olvidaba scores y rompia el marcador y el giro.
  state = {
    ...next,
    options: next.options ?? [],
    history: next.history ?? [],
    scores: next.scores ?? {},
    duel: next.duel ?? null,
    turn: next.turn === 'b' ? 'b' : 'a',
    activePreset: next.activePreset ?? null
  };
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
    state = { options: data.options, history: [], scores: {}, duel: null, turn: 'a', activePreset: preset.id };
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
    const equipoElegido = needsTeams() ? $('option-team').value : '';
    const option = { id: newId(), name: name || `Opción ${state.options.length + 1}`, image, team: equipoElegido || null };
    state = { ...state, options: [...state.options, option], activePreset: null };
    $('option-form').reset();
    clearPreview();
    // El equipo se conserva para encadenar altas sin pulsarlo cada vez.
    lastTeamChoice = equipoElegido;
    $('option-team').value = equipoElegido;
    $('upload-text').querySelector('strong').textContent = 'Elige una imagen';
    $('upload-text').querySelector('small').textContent = 'JPG, PNG, WebP o GIF · máx. 12 MB';
    $('result').hidden = true;
    render();
    $('option-team').value = equipoElegido;
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
    state = { ...state, history: [], scores: {}, duel: null, turn: 'a' };
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
    state = { ...state, history: [], scores: {}, duel: null, turn: 'a' };
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
  audioControls.startOnSpin();
  if (turnoPorEquipo()) {
    await spinOwnWheels();
    return;
  }
  if (prefs.mode === 'duelo') {
    await spinDuel();
    return;
  }
  const remaining = remainingOptions();
  if (!remaining.length) return;
  spinning = true;
  $('result').hidden = true;
  render();
  const index = Math.floor(Math.random() * remaining.length);
  const winner = remaining[index];
  await wheel.spin(index);
  showResult(winner);
  await new Promise((resolve) => setTimeout(resolve, 850));
  spinning = false;
  update({ ...state, history: prefs.removeDrawn ? [...state.history, winner.id] : state.history });
});
function showResult(winner) {
  const result = $('result');
  const text = document.createElement('div');
  const label = document.createElement('small');
  label.textContent = 'HA SALIDO';
  const name = document.createElement('strong');
  name.textContent = winner.name;
  text.append(label, name);
  result.replaceChildren(thumbnail(winner, 'result-image'), text);
  result.hidden = false;
}

async function spinDuel() {
  const pool = duelPool();
  if (!pool.length) {
    notify('No hay opciones para tirar. Añade opciones al duelo.');
    return;
  }
  spinning = true;
  $('result').hidden = true;
  $('duel-result').hidden = true;
  render();

  const nombrePrimero = nombreTurno();
  const firstIndex = Math.floor(Math.random() * pool.length);
  const first = pool[firstIndex];
  await wheel.spin(firstIndex);
  showResult(first);

  // La segunda tirada es del rival: se cambia el turno para que el aviso lo diga.
  const nombreSegundo = teams()[turnoActual() === 'a' ? 1 : 0]?.name ?? 'el rival';
  state = { ...state, turn: turnoActual() === 'a' ? 'b' : 'a' };
  render();

  let secondPool = pool;
  if (pool.length > 1) {
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
  bump(first);
  bump(second);
  const winner = `${nombrePrimero}: ${first.name}  ·  ${nombreSegundo}: ${second.name}`;

  const history = [...state.history, first.id, second.id];
  state = { ...state, history, scores, duel: { winner, a: first.name, b: second.name } };
  spinning = false;
  update(state);
}

function duelPool() {
  return remainingOptions();
}

async function spinOwnWheels() {
  const { a, b } = splitByTeam();
  const turno = turnoActual();
  const opciones = turno === 'a' ? a : b;
  const rival = turno === 'a' ? b : a;
  const nombre = nombreTurno();
  const nombreRival = teams()[turno === 'a' ? 1 : 0]?.name ?? 'el rival';

  if (!opciones.length) {
    if (!rival.length) {
      notify('Ninguno de los dos tiene opciones asignadas.');
    } else {
      notify(`${nombre} ya no tiene opciones. Pulsa reiniciar para empezar otra ronda.`);
    }
    return;
  }
  if (prefs.mode !== 'equipos' && !rival.length) {
    notify(`${nombreRival} no tiene opciones asignadas.`);
    return;
  }

  spinning = true;
  $('result').hidden = true;
  $('duel-result').hidden = true;
  render();

  const index = Math.floor(Math.random() * opciones.length);
  const winner = opciones[index];
  await wheel.spin(index);
  showResult(winner);

  await new Promise((resolve) => setTimeout(resolve, 900));
  const scores = { ...state.scores };
  if (winner.team) scores[winner.team] = (scores[winner.team] ?? 0) + 1;
  // El duelo por ruletas propias siempre retira la opcion; en Equipos depende
  // del interruptor, para poder repetir si se quiere.
  const quitar = prefs.mode !== 'equipos' || prefs.removeDrawn;
  spinning = false;
  update({
    ...state,
    history: quitar ? [...state.history, winner.id] : state.history,
    scores,
    turn: turno === 'a' ? 'b' : 'a',
    duel: prefs.mode === 'duelo' ? { winner: `${nombre}: ${winner.name}`, a: nombre, b: winner.name } : null
  });
}

$('undo-button').addEventListener('click', () => {
  if (spinning || !state.history.length) return;
  const lastId = state.history[state.history.length - 1];
  const restored = state.options.find((option) => option.id === lastId);
  const scores = { ...state.scores };
  if (restored?.team) {
    scores[restored.team] = Math.max(0, (scores[restored.team] ?? 0) - 1);
  }
  $('result').hidden = true;
  const porTurnos = turnoPorEquipo();
  update({
    ...state,
    history: state.history.slice(0, -1),
    scores: porTurnos ? scores : state.scores,
    turn: porTurnos ? (state.turn === 'a' ? 'b' : 'a') : state.turn
  });
  notify(`${restored?.name ?? 'La opción'} vuelve a participar.`);
});

$('reset-button').addEventListener('click', () => {
  if (spinning || !state.history.length) return;
  if (!window.confirm('¿Reiniciar la ronda? Todas las opciones volverán a participar.')) return;
  $('result').hidden = true;
  update({ ...state, history: [], scores: {}, duel: null, turn: 'a' });
  notify('Ronda reiniciada.');
});

$('restore-button').addEventListener('click', () => {
  if (spinning) return;
  if (!window.confirm('¿Volver a las opciones publicadas en config.json?')) return;
  $('result').hidden = true;
  update({ options: [...published.options], history: [], scores: {}, duel: null, turn: 'a', activePreset: null });
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
    state = { options, history: [], scores: {}, duel: null, turn: 'a', activePreset: null };
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
state = { options: [...published.options], history: [], scores: {}, duel: null, turn: 'a', activePreset: null };
presets = await loadPresetIndex();
render();
