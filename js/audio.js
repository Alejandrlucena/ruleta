const VOLUME_KEY = 'la-ruleta-volume-v1';
const SONG = './musica.mp3';

export function setupAudio(notify) {
  const audio = new Audio();
  const playButton = document.getElementById('music-play');
  const fileInput = document.getElementById('music-file');
  const volumeInput = document.getElementById('music-volume');
  const source = document.getElementById('music-source');
  let localUrl = null;
  let pausedByUser = false;
  let pendingUnlock = false;
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

  async function play() {
    if (!audio.src) audio.src = SONG;
    audio.muted = false;
    try {
      await audio.play();
      source.textContent = 'Música de fondo';
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
    if (!audio.src) audio.src = SONG;
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
    source.textContent = 'Música de fondo';
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
    audio.src = localUrl;
    audio.muted = false;
    source.textContent = `${file.name} · solo en esta sesión`;
    if (resume) void play();
  });

  volumeInput.addEventListener('input', () => {
    audio.volume = Number(volumeInput.value) / 100;
    try { localStorage.setItem(VOLUME_KEY, volumeInput.value); } catch {}
  });

  audio.addEventListener('play', syncButton);
  audio.addEventListener('pause', syncButton);
  audio.addEventListener('error', () => {
    source.textContent = 'No se ha podido cargar la música';
    syncButton();
  });

  void start();

  return {
    startOnSpin() {
      if (pausedByUser || !audio.paused) return;
      pendingUnlock = false;
      void play();
    }
  };
}
