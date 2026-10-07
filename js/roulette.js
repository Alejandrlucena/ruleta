const COLORS = ['#e6a18a', '#b8dd92', '#8da6d8', '#e7c987', '#ad91d0', '#80c5bb', '#df9eaf', '#b8bbef'];

// Alto util aproximado del sector: dos veces la distancia a la linea que separa
// el sector de su vecino, medida desde el centro de la ruleta.
function radioDeSector(slice, radius) {
  return 2 * radius * .72 * Math.sin(slice / 2);
}

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
          // Proporcional al sector y al radio: sin maximos fijos.
          const alto = Math.max(9, Math.min(Math.sin(slice / 2) * radius * .82, radius * .09));
          ctx.fillStyle = '#1c2234';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `700 ${alto}px 'DM Sans', sans-serif`;
          const ancho = Math.max(40, Math.sin(slice / 2) * radius * .95);
          ctx.fillText(this.fit(option.name, ancho), x, y + thumbRadius + 13);
        }
      } else if (count > 1 && count <= 6 && Math.sin(slice / 2) > .45) {
        this.drawCenteredText(option.name, angle, slice, radius, center);
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

  partir(palabras, ctx, ancho, maxLineas) {
    const lineas = [];
    let actual = '';
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width <= ancho) {
        actual = prueba;
        continue;
      }
      if (actual) lineas.push(actual);
      actual = palabra;
      if (lineas.length >= maxLineas) return null;
      if (ctx.measureText(actual).width > ancho) return null;
    }
    if (actual) lineas.push(actual);
    return lineas.length <= maxLineas ? lineas : null;
  }

  // Con pocos cortes el sector es enorme: el nombre va centrado y a dos lineas,
  // que se lee mucho mejor que encogerlo para que quepa a lo largo del radio.
  drawCenteredText(name, angle, slice, radius, center) {
    const ctx = this.context;
    const texto = String(name || '').trim() || '?';
    const distancia = radius * .52;
    const cx = center + Math.cos(angle) * distancia;
    const cy = center + Math.sin(angle) * distancia;
    // A esa distancia el sector abre 2 * distancia * sin(mitad), menos un margen.
    const semiancho = distancia * Math.sin(slice / 2);
    const anchoCaja = semiancho * 1.62;
    const altoCaja = radioDeSector(slice, radius);
    const palabras = texto.split(/\s+/);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1c2234';
    const maximo = Math.max(10, Math.min(altoCaja * .55, radius * .16));
    for (let size = maximo; size >= 9; size -= 1) {
      ctx.font = `700 ${size}px 'DM Sans', sans-serif`;
      const lineas = this.partir(palabras, ctx, anchoCaja, 2);
      if (!lineas) continue;
      const altoTotal = lineas.length * size * 1.18;
      if (altoTotal > altoCaja) continue;
      lineas.forEach((linea, i) => {
        ctx.fillText(linea, cx, cy - altoTotal / 2 + size * .59 + i * size * 1.18);
      });
      return;
    }
    ctx.font = `700 9px 'DM Sans', sans-serif`;
    ctx.fillText(this.fit(texto, anchoCaja), cx, cy);
  }

  drawRadialText(name, angle, count, slice, radius, center) {
    const ctx = this.context;
    const text = String(name || '').trim() || '?';

    // El tamano sale solo de la geometria del sector: nada de valores fijos.
    //  · el grosor del sector en su parte interior limita el alto de la letra
    //  · el tramo radial disponible limita cuantos caracteres caben
    const inner = radius * (count > 60 ? .55 : .46);
    const outer = radius * (count > 40 ? .95 : .95);
    const grosor = 2 * inner * Math.sin(slice / 2);
    const recorrido = outer - inner;

    let size = grosor * .62;
    const anchoNecesario = text.length * size * .52;
    if (anchoNecesario > recorrido) size = recorrido / (text.length * .52);
    size = Math.max(6, Math.min(size, radius * .2));

    // Con una sola opcion el sector es un circulo entero: el limite es el diametro.
    if (count === 1) {
      const grande = Math.max(9, Math.min(radius * .3, this.size * .12));
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${grande}px 'DM Sans', sans-serif`;
      ctx.fillStyle = '#1c2234';
      ctx.fillText(this.fit(text, radius * 1.35), center, center - radius * .24);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(angle);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px 'DM Sans', sans-serif`;
    ctx.fillStyle = '#1c2234';
    ctx.fillText(this.fit(text, recorrido * .98), outer, 0);
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
