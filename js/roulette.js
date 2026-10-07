const COLORS = ['#e6a18a', '#b8dd92', '#8da6d8', '#e7c987', '#ad91d0', '#80c5bb', '#df9eaf', '#b8bbef'];

export class Roulette {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.options = [];
    this.images = new Map();
    this.rotation = 0;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const measured = this.canvas.getBoundingClientRect().width;
    // Un canvas oculto mide 0: se conserva el ultimo tamano valido para no
    // dibujar con radio negativo cuando la ruleta vuelve a ser visible.
    if (measured < 1) {
      if (this.size > 1) this.draw();
      return;
    }
    const size = Math.round(measured);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(size * ratio);
    this.canvas.height = Math.round(size * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.size = size;
    this.draw();
  }

  setOptions(options) {
    this.options = options;
    this.rotation = 0;
    this.canvas.style.transition = 'none';
    this.canvas.style.transform = 'rotate(0deg)';
    this.draw();
  }

  imageFor(option) {
    if (!option.image) return null;
    const cached = this.images.get(option.id);
    if (cached?.src === option.image) return cached.loaded ? cached.image : null;
    const image = new Image();
    const entry = { src: option.image, image, loaded: false };
    this.images.set(option.id, entry);
    image.onload = () => {
      entry.loaded = true;
      this.draw();
    };
    image.onerror = () => { entry.loaded = false; };
    image.src = option.image;
    return null;
  }

  draw() {
    if (!this.size || this.size < 4) return;
    const ctx = this.context;
    const center = this.size / 2;
    const radius = center - 1;
    if (radius < 2) return;
    ctx.clearRect(0, 0, this.size, this.size);

    if (!this.options.length) {
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#333951';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(center, center, radius * .74, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff32';
      ctx.setLineDash([4, 8]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#d8dded';
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.max(13, this.size * .043)}px 'Space Grotesk', sans-serif`;
      ctx.fillText('TU RULETA', center, center - 39);
      ctx.fillStyle = '#aab1c9';
      ctx.font = `500 ${Math.max(10, this.size * .028)}px 'DM Sans', sans-serif`;
      ctx.fillText('Añade opciones para empezar', center, center + 48);
      return;
    }

    const count = this.options.length;
    const slice = Math.PI * 2 / count;
    this.options.forEach((option, index) => {
      const start = -Math.PI / 2 + slice * index;
      const angle = start + slice / 2;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = COLORS[index % COLORS.length];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#22263c';
      ctx.stroke();

      const image = this.imageFor(option);
      if (image) {
        const x = center + Math.cos(angle) * radius * .62;
        const y = center + Math.sin(angle) * radius * .62;
        const thumbRadius = Math.max(8, Math.min(38, radius * .19, count === 1 ? 38 : Math.sin(slice / 2) * radius * .54));
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, thumbRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#252a41';
        ctx.fill();
        const scale = Math.max(thumbRadius * 2 / image.naturalWidth, thumbRadius * 2 / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
        ctx.restore();
        if (count <= 7) {
          const alto = Math.max(9, Math.min(Math.sin(slice / 2) * radius * .7, this.size * .045, 18));
          ctx.fillStyle = '#1c2234';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `700 ${alto}px 'DM Sans', sans-serif`;
          const ancho = Math.max(40, Math.sin(slice / 2) * radius * .9);
          ctx.fillText(this.fit(option.name, ancho), x, y + thumbRadius + 13);
        }
      } else {
        this.drawRadialText(option.name, angle, count, slice, radius, center);
      }
    });
    ctx.beginPath();
    ctx.arc(center, center, radius - 1, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#25293f';
    ctx.stroke();
  }

  fit(text, maxWidth) {
    if (this.context.measureText(text).width <= maxWidth) return text;
    let cut = text.length - 1;
    while (cut > 1 && this.context.measureText(`${text.slice(0, cut)}…`).width > maxWidth) cut -= 1;
    return `${text.slice(0, cut)}…`;
  }

  drawRadialText(name, angle, count, slice, radius, center) {
    const ctx = this.context;
    const text = String(name || '').trim() || '?';

    // Con una sola opcion el sector es un circulo entero: no hay limite
    // angular, asi que el texto va centrado y del tamano que quepa.
    if (count === 1) {
      const alto = Math.max(10, Math.min(radius * .17, this.size * .06, 28));
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${alto}px 'DM Sans', sans-serif`;
      ctx.fillStyle = '#1c2234';
      ctx.fillText(this.fit(text, radius * 1.3), center, center - radius * .22);
      ctx.restore();
      return;
    }

    const inner = radius * (count > 60 ? .52 : .44);
    const outer = radius * (count > 40 ? .93 : .9);

    // El grosor del sector cerca del centro limita el alto de la letra;
    // el tramo radial disponible limita cuantos caben.
    const grosor = Math.max(2, Math.sin(slice / 2) * inner * 2 * .62);
    const alto = Math.min(grosor, radius * .17, Math.max(6, this.size * .06));
    const size = Math.max(6, Math.min(alto, 30));
    const disponible = (outer - inner) / (size * .52);

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(angle);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px 'DM Sans', sans-serif`;
    ctx.fillStyle = '#1c2234';
    ctx.fillText(this.fit(text, disponible * size * .52), outer, 0);
    ctx.restore();
  }

  spin(index) {
    const count = this.options.length;
    const desired = (360 - (index + .5) * 360 / count % 360) % 360;
    const current = (this.rotation % 360 + 360) % 360;
    const delta = (desired - current + 360) % 360;
    this.rotation += (6 + Math.floor(Math.random() * 3)) * 360 + delta;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 5200;
    void this.canvas.offsetWidth;
    this.canvas.style.transition = `transform ${duration}ms cubic-bezier(.12,.68,.08,1)`;
    this.canvas.style.transform = `rotate(${this.rotation}deg)`;
    return new Promise((resolve) => setTimeout(resolve, duration + 70));
  }
}
