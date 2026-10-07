const VOLUME_KEY = 'la-ruleta-volume-v1';
const DEFAULT_SONG = './musica.mp3';

export function setupAudio(notify, initialMusic = null) {
  const audio = new Audio();
  const playButton = document.getElementById('music-play');
  const fileInput = document.getElementById('music-file');
  const volumeInput = document.getElementById('music-volume');
  const source = document.getElementById('music-source');
  let localUrl = null;
  let pausedByUser = false;
  let pendingUnlock = false;
  let trackSrc = initialMusic?.src || DEFAULT_SONG;
  let trackLabel = null;
  let autoplayWanted = initialMusic ? initialMusic.autoplay !== false : true;
  audio.loop = true;

  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const stored = Number(raw);
    if (raw !== null && Number.isFinite(stored) && stored >= 0 && stored <= 100) volumeInput.value = stored;
  } catch {}
  audio.volume = Number(volumeInput.value) / 100;

  function syncButton() {
    const playing = !audio.paused;
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', playing ? 'Pausar música' : 'Reproducir música');
  }

  function applyVolume() {
    audio.volume = Number(volumeInput.value) / 100;
  }

  async function play() {
    if (!audio.src) audio.src = trackSrc;
    audio.muted = false;
    try {
      await audio.play();
      source.textContent = trackLabel || 'Música de fondo';
      return true;
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        pendingUnlock = true;
        source.textContent = 'Toca la página para activar la música';
      } else {
        source.textContent = 'No se ha podido cargar la música';
        notify('No se puede reproducir la canción. Comprueba que el MP3 esté junto a index.html.');
      }
      return false;
    }
  }

  async function playMutedThenUnmute() {
    if (!audio.src) audio.src = trackSrc;
    audio.muted = true;
    let started = false;
    try {
      await audio.play();
      started = true;
    } catch {
      audio.muted = false;
      return false;
    }
    audio.muted = false;
    if (!started) return false;
    source.textContent = trackLabel || 'Música de fondo';
    return true;
  }

  async function start() {
    if (pausedByUser) return;
    if (await play()) return;
    if (await playMutedThenUnmute()) return;
    source.textContent = 'Toca la página para activar la música';
  }

  const unlockEvents = ['pointerdown', 'touchstart', 'keydown', 'click', 'mousedown'];
  function unlock() {
    if (!pendingUnlock || pausedByUser) return;
    pendingUnlock = false;
    void play();
  }
  unlockEvents.forEach((event) => document.addEventListener(event, unlock, { capture: true, passive: true }));

  playButton.addEventListener('click', () => {
    if (!audio.paused) {
      pausedByUser = true;
      pendingUnlock = false;
      audio.pause();
      source.textContent = 'Música en pausa';
      return;
    }
    pausedByUser = false;
    pendingUnlock = false;
    void play();
  });

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.mp3$/i.test(file.name)) {
      notify('La canción debe ser un archivo .mp3.');
      return;
    }
    const resume = !audio.paused && !pausedByUser;
    pausedByUser = false;
    pendingUnlock = false;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = URL.createObjectURL(file);
    trackSrc = localUrl;
    trackLabel = `${file.name} · solo en esta sesión`;
    audio.src = trackSrc;
    audio.muted = false;
    source.textContent = trackLabel;
    if (resume) void play();
  });

  volumeInput.addEventListener('input', () => {
    applyVolume();
    try { localStorage.setItem(VOLUME_KEY, volumeInput.value); } catch {}
  });

  audio.addEventListener('play', syncButton);
  audio.addEventListener('pause', syncButton);
  audio.addEventListener('error', () => {
    source.textContent = 'No se ha podido cargar la música';
    syncButton();
  });

  if (autoplayWanted) void start();

  return {
    getTrack() {
      return { src: localUrl ? null : trackSrc, label: trackLabel, volume: Number(volumeInput.value) };
    },
    async setTrack(music, label) {
      if (!music?.src) return;
      trackSrc = music.src;
      trackLabel = label || null;
      if (Number.isFinite(music.volume)) {
        volumeInput.value = music.volume;
        try { localStorage.setItem(VOLUME_KEY, volumeInput.value); } catch {}
      }
      applyVolume();
      pausedByUser = false;
      pendingUnlock = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.muted = false;
      audio.src = trackSrc;
      source.textContent = trackLabel || 'Música de fondo';
      if (music.autoplay !== false) await play();
    },
    startOnSpin() {
      if (pausedByUser || !audio.paused) return;
      pendingUnlock = false;
      void play();
    }
  };
}
