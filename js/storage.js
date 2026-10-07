const PREFS_KEY = 'la-ruleta-prefs-v1';

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

export function readPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (!saved || typeof saved !== 'object') return { removeDrawn: true };
    return { removeDrawn: saved.removeDrawn !== false };
  } catch {
    return { removeDrawn: true };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

export async function loadPublishedConfig() {
  try {
    const response = await fetch('./config.json', { cache: 'no-store' });
    if (!response.ok) return { version: null, options: [], music: null };
    const config = await response.json();
    return {
      version: config.version ?? null,
      options: normalizeOptions(config.options),
      music: normalizeMusic(config.music)
    };
  } catch {
    return { version: null, options: [], music: null };
  }
}

function normalizeMusic(music) {
  if (!music || typeof music !== 'object') return null;
  const src = typeof music.src === 'string' && music.src.trim() ? music.src.trim() : null;
  const volume = Number(music.volume);
  return {
    src,
    volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : 45,
    autoplay: music.autoplay !== false
  };
}

export async function loadPresetIndex() {
  try {
    const response = await fetch('./presets/index.json', { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data.presets)) return [];
    return data.presets.filter((preset) => preset && typeof preset.id === 'string' && typeof preset.file === 'string');
  } catch {
    return [];
  }
}

export async function loadPreset(file) {
  let preset;
  try {
    const response = await fetch(`./presets/${encodeURIComponent(file)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error();
    preset = await response.json();
  } catch {
    throw new Error('No se ha podido leer el preset desde el repositorio.');
  }
  if (!preset || !Array.isArray(preset.options) || !preset.options.length) {
    throw new Error('El preset no contiene opciones válidas.');
  }
  return {
    name: typeof preset.name === 'string' && preset.name.trim() ? preset.name.trim().slice(0, 40) : file,
    description: typeof preset.description === 'string' ? preset.description.slice(0, 120) : '',
    options: normalizeOptions(preset.options),
    music: normalizeMusic(preset.music) ?? { src: null, volume: 45, autoplay: true }
  };
}

export function buildPreset(name, description, options, music) {
  return {
    name: (name || 'Mi preset').slice(0, 40),
    description: (description || '').slice(0, 120),
    options: options.map(({ id, name: optionName, image }) => ({ id, name: optionName, image })),
    music: { src: music.src, volume: music.volume, autoplay: music.autoplay !== false }
  };
}

export async function importOptions(file) {
  const config = JSON.parse(await file.text());
  if (!config || !Array.isArray(config.options)) throw new Error('El JSON debe incluir una lista "options".');
  const options = normalizeOptions(config.options);
  if (options.length !== config.options.length) throw new Error('Hay opciones inválidas en el archivo.');
  return options;
}

export function downloadJson(filename, data) {
  const json = JSON.stringify(data, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportOptions(options) {
  downloadJson('config.json', { version: Date.now(), options });
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
