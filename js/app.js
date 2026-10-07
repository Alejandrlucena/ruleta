import { Roulette } from './roulette.js';
import { buildPreset, compressImage, downloadJson, exportOptions, importOptions, loadPreset, loadPresetIndex, loadPublishedConfig, newId, readLocalState, saveLocalState } from './storage.js';
import { setupAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const wheel = new Roulette($('wheel'));
let state = { options: [], history: [], activePreset: null };
let published = { version: null, options: [], music: null };
let presets = [];
let spinning = false;
let previewUrl = null;
let toastTimer;

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
    const status = document.createElement('small');
    status.textContent = drawn.has(option.id) ? 'YA HA SALIDO' : 'EN JUEGO';
    info.append(name, status);
    row.append(info);

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

function render() {
  const remaining = remainingOptions();
  $('remaining-count').textContent = remaining.length;
  $('spin-button').disabled = spinning || !remaining.length;
  $('spin-button').firstChild.textContent = spinning ? 'GIRANDO... ' : 'GIRAR RULETA ';
  $('spin-hint').textContent = spinning ? 'La suerte está echada...' : remaining.length ? 'Cada resultado se retira de las siguientes tiradas.' : state.options.length ? 'Ronda completada. Reinicia para volver a jugar.' : 'Personaliza tus opciones para empezar.';
  $('add-button').disabled = spinning;
  $('round-actions').hidden = !state.history.length;
  $('reset-button').hidden = !state.history.length;
  $('undo-button').hidden = !state.history.length;
  $('reset-button').disabled = spinning;
  $('undo-button').disabled = spinning;
  $('restore-button').disabled = spinning;
  $('export-button').disabled = spinning || !state.options.length;
  $('save-preset-button').disabled = spinning || !state.options.length;
  wheel.setOptions(remaining);
  renderOptions();
  renderHistory();
  renderPresets();
}

function update(next) {
  state = next;
  if (!saveLocalState(state, published)) notify('No se ha podido guardar en el navegador. Los cambios podrían perderse al recargar.');
  render();
}

function renderPresets() {
  const list = $('preset-list');
  list.replaceChildren();
  if (!presets.length) {
    list.append(emptyMessage('Todavía no hay presets en el repositorio.'));
    return;
  }
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
    update({ options: data.options, history: [], activePreset: preset.id });
    if (data.music.src) {
      await audioControls.setTrack(data.music, data.name);
    }
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
  downloadJson(`${name.trim().replace(/[^\w-]+/g, '-').slice(0, 30) || 'preset'}.json`, buildPreset(name.trim(), description.trim(), state.options, { src: track.src, volume: track.volume, autoplay: true }));
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
    const option = { id: newId(), name: name || `Opción ${state.options.length + 1}`, image };
    const next = { ...state, options: [...state.options, option], activePreset: null };
    if (!saveLocalState(next, published)) throw new Error('No queda espacio en el navegador. Prueba a usar URLs de imágenes o elimina algunas opciones.');
    state = next;
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

$('spin-button').addEventListener('click', async () => {
  if (spinning) return;
  const remaining = remainingOptions();
  if (!remaining.length) return;
  audioControls.startOnSpin();
  spinning = true;
  $('result').hidden = true;
  render();
  const index = Math.floor(Math.random() * remaining.length);
  const winner = remaining[index];
  await wheel.spin(index);
  const result = $('result');
  const text = document.createElement('div');
  const label = document.createElement('small');
  label.textContent = 'HA SALIDO';
  const name = document.createElement('strong');
  name.textContent = winner.name;
  text.append(label, name);
  result.replaceChildren(thumbnail(winner, 'result-image'), text);
  result.hidden = false;
  await new Promise((resolve) => setTimeout(resolve, 850));
  spinning = false;
  update({ ...state, history: [...state.history, winner.id] });
});

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
  if (!window.confirm('¿Descartar tus cambios locales y volver a las opciones iniciales publicadas?')) return;
  $('result').hidden = true;
  update({ options: [...published.options], history: [], activePreset: null });
  notify('Configuración inicial restaurada.');
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
    if (spinning || !window.confirm('¿Sustituir las opciones actuales por las del archivo? El historial de esta ronda se borrará.')) return;
    const next = { options, history: [], activePreset: null };
    if (!saveLocalState(next, published)) throw new Error('El archivo es demasiado grande para guardarlo en este navegador.');
    state = next;
    $('result').hidden = true;
    render();
    notify(`${options.length} opciones importadas.`);
  } catch (error) {
    notify(error.message || 'No se ha podido importar el archivo.');
  }
});

published = await loadPublishedConfig();
const audioControls = setupAudio(notify, published.music);
state = readLocalState(published);
presets = await loadPresetIndex();
render();
