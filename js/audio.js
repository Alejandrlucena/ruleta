const VOLUME_KEY = 'la-ruleta-volume-v1';
const DEFAULT_SONG = './musica.mp3';
const DEFAULT_VOLUME = 70;

export function setupAudio(notify, initialMusic = null) {
  const audio = new Audio();
  const playButton = document.getElementById('music-play');
  const muteButton = document.getElementById('music-mute');
  const fileInput = document.getElementById('music-file');
  const source = document.getElementById('music-source');
  let localUrl = null;
  let pausedByUser = false;
  let pendingUnlock = false;
  let mutedByUser = false;
  let volume = DEFAULT_VOLUME;
  let trackSrc = initialMusic?.src || DEFAULT_SONG;
  let trackLabel = null;
  let autoplayWanted = initialMusic ? initialMusic.autoplay !== false : true;
  audio.loop = true;

  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const stored = Number(raw);
    if (raw !== null && Number.isFinite(stored) && stored > 0 && stored <= 100) volume = stored;
  } catch {}
  if (initialMusic && Number.isFinite(initialMusic.volume) && initialMusic.volume > 0) volume = initialMusic.volume;
  audio.volume = volume / 100;

  function syncMute() {
    muteButton.setAttribute('aria-pressed', String(mutedByUser));
    muteButton.setAttribute('aria-label', mutedByUser ? 'Quitar silencio' : 'Silenciar');
    muteButton.textContent = mutedByUser ? '🔇' : '🔊';
  }

  function syncButton() {
    const playing = !audio.paused;
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', playing ? 'Pausar música' : 'Reproducir música');
  }

  syncMute();

  async function play() {
    if (!audio.src) audio.src = trackSrc;
    audio.muted = mutedByUser;
    audio.volume = volume / 100;
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
      audio.muted = mutedByUser;
      return false;
    }
    audio.muted = mutedByUser;
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

  muteButton.addEventListener('click', () => {
    mutedByUser = !mutedByUser;
    audio.muted = mutedByUser;
    syncMute();
    source.textContent = mutedByUser ? 'Música silenciada' : (trackLabel || 'Música de fondo');
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
    audio.muted = mutedByUser;
    source.textContent = trackLabel;
    if (resume) void play();
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
      return { src: localUrl ? null : trackSrc, label: trackLabel, volume, muted: mutedByUser };
    },
    async setTrack(music, label) {
      if (!music?.src) return;
      trackSrc = music.src;
      trackLabel = label || null;
      if (Number.isFinite(music.volume) && music.volume > 0) {
        volume = Math.max(1, Math.min(100, music.volume));
        try { localStorage.setItem(VOLUME_KEY, volume); } catch {}
      }
      audio.volume = volume / 100;
      pausedByUser = false;
      pendingUnlock = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.muted = mutedByUser;
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
