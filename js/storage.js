const STORAGE_KEY = 'la-ruleta-state-v1';
const PROGRESS_KEY = 'la-ruleta-progress-v1';
const CUSTOM_KEY = 'la-ruleta-custom-v1';

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  const ids = new Set();
  return options.filter((option) => option && typeof option === 'object' && typeof option.image === 'string' && typeof option.name === 'string').map((option) => {
    let id = typeof option.id === 'string' && option.id ? option.id : newId();
    if (ids.has(id)) id = newId();
    ids.add(id);
    return { id, name: option.name.slice(0, 40), image: option.image };
  });
}

export function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const options = normalizeOptions(saved.options);
    const validIds = new Set(options.map((option) => option.id));
    const history = Array.isArray(saved.history) ? saved.history.filter((id, index, all) => validIds.has(id) && all.indexOf(id) === index) : [];
    return { options, history };
  } catch {
    return null;
  }
}

export async function loadPublishedConfig() {
  try {
    const response = await fetch('./config.json', { cache: 'no-store' });
    if (!response.ok) return { version: null, options: [] };
    const config = await response.json();
    return { version: config.version ?? null, options: normalizeOptions(config.options) };
  } catch {
    return { version: null, options: [] };
  }
}

export function readLocalState(published) {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(CUSTOM_KEY)); } catch {}
  const baseIds = new Set(published.options.map((option) => option.id));
  if (!saved || !Array.isArray(saved.added)) {
    const legacy = readState();
    const added = legacy?.options.filter((option) => !baseIds.has(option.id)) ?? [];
    const options = [...published.options, ...added];
    const ids = new Set(options.map((option) => option.id));
    let previousProgress = [];
    try {
      const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY));
      if (progress?.version === published.version && Array.isArray(progress.history)) previousProgress = progress.history;
    } catch {}
    const history = (previousProgress.length ? previousProgress : legacy?.history ?? []).filter((id, index, all) => ids.has(id) && all.indexOf(id) === index);
    return { options, history };
  }
  const removed = new Set(Array.isArray(saved.removedIds) ? saved.removedIds : []);
  const overrides = new Map(normalizeOptions(saved.overrides).map((option) => [option.id, option]));
  const options = published.options.filter((option) => !removed.has(option.id)).map((option) => overrides.get(option.id) ?? option);
  options.push(...normalizeOptions(saved.added).filter((option) => !baseIds.has(option.id)));
  const ids = new Set(options.map((option) => option.id));
  const history = saved.version === published.version && Array.isArray(saved.history) ? saved.history.filter((id, index, all) => ids.has(id) && all.indexOf(id) === index) : [];
  return { options, history };
}

export function saveLocalState(state, published) {
  const baseIds = new Set(published.options.map((option) => option.id));
  const current = new Map(state.options.map((option) => [option.id, option]));
  const payload = {
    version: published.version,
    added: state.options.filter((option) => !baseIds.has(option.id)),
    removedIds: published.options.filter((option) => !current.has(option.id)).map((option) => option.id),
    overrides: published.options.filter((option) => current.has(option.id) && (current.get(option.id).name !== option.name || current.get(option.id).image !== option.image)).map((option) => current.get(option.id)),
    history: state.history
  };
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export async function importOptions(file) {
  const config = JSON.parse(await file.text());
  if (!config || !Array.isArray(config.options)) throw new Error('El JSON debe incluir una lista "options".');
  const options = normalizeOptions(config.options);
  if (options.length !== config.options.length) throw new Error('Hay opciones inválidas en el archivo.');
  return options;
}

export function exportOptions(options) {
  const json = JSON.stringify({ version: Date.now(), options }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'config.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function compressImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Usa una imagen JPG, PNG, WebP o GIF.');
  if (file.size > 12 * 1024 * 1024) throw new Error('La imagen no puede superar los 12 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = 240;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } catch {
    throw new Error('No se ha podido abrir la imagen. Prueba con otro archivo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
