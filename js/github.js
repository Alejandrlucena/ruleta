// Publicacion de presets en GitHub desde el navegador, sin servidor.
//
// GitHub no permite el flujo OAuth de dispositivo desde una pagina web (sus
// endpoints no envian cabeceras CORS), pero api.github.com si las envia. Por eso
// aqui se usa un token personal: el usuario lo crea una vez con permiso de
// escritura solo sobre el repositorio y lo pega en la web.
//
// El token vive en sessionStorage: se pierde al cerrar la pestana y nunca se
// escribe en un archivo del repositorio.

const TOKEN_KEY = 'la-ruleta-github-token';
const API = 'https://api.github.com';

function endpoints() {
  const consulta = new URLSearchParams(location.search);
  const repo = consulta.get('repo') || 'Alejandrlucena/ruleta';
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error('El repositorio no es valido. Usa ?repo=usuario/repositorio');
  return { owner, name, repo };
}

export function token() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function guardarToken(valor) {
  try { sessionStorage.setItem(TOKEN_KEY, valor.trim()); } catch {}
}

export function cerrarSesion() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

// Enlace para crear el token con el alcance minimo.
export function enlaceToken() {
  return 'https://github.com/settings/personal-access-tokens/new';
}

async function pedirApi(ruta, opciones = {}) {
  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token()}`,
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      ...opciones.headers
    }
  });
  if (respuesta.status === 204) return null;
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const detalle = datos.message ? ` (${datos.message})` : '';
    throw new Error(`GitHub: ${respuesta.status}${detalle}`);
  }
  return datos;
}

function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

// La API devuelve el archivo en Base64 con saltos de linea, hay que descodificarlo.
function deBase64(base64) {
  const binario = atob(base64.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Comprueba el token y devuelve con que cuenta se entra.
export async function verificarToken() {
  if (!token()) throw new Error('Falta el token.');
  const usuario = await pedirApi('/user');
  const { repo } = endpoints();
  try {
    const info = await pedirApi(`/repos/${repo}`);
    if (!info.permissions?.push) throw new Error('El token no tiene permiso de escritura en ' + repo + '.');
  } catch (error) {
    if (/404/.test(error.message)) throw new Error('El token no tiene acceso al repositorio ' + repo + '.');
    throw error;
  }
  return { usuario: usuario.login, repo };
}

async function leerArchivo(ruta) {
  try {
    return await pedirApi(`/repos/${ruta}`);
  } catch (error) {
    if (String(error.message).includes('(404)')) return null;
    throw error;
  }
}

// Sube un archivo; si ya existe, conserva su sha para poder sobrescribirlo.
async function escribirArchivo(owner, name, ruta, contenido, mensaje) {
  const anterior = await leerArchivo(`${owner}/${name}/${ruta}`);
  return pedirApi(`/repos/${owner}/${name}/contents/${ruta}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: mensaje,
      content: aBase64(contenido),
      branch: 'main',
      ...(anterior?.sha ? { sha: anterior.sha } : {})
    })
  });
}

// Publica el preset y anade su entrada al indice. Si el indice no cuadra con
// lo que hay en el repositorio, se vuelve a construir desde los archivos reales.
export async function publicarPreset(preset, alInformar) {
  const { owner, name } = endpoints();
  if (!token()) throw new Error('No has conectado ningun token de GitHub.');

  const id = (preset.name || 'preset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'preset';
  const ruta = `presets/${id}.json`;
  const indiceRuta = 'presets/index.json';

  alInformar?.('Subiendo el preset...');
  await escribirArchivo(owner, name, ruta, `${JSON.stringify(preset, null, 2)}\n`, `Preset: ${preset.name}`);

  alInformar?.('Actualizando el indice...');
  let indice = { presets: [] };
  const indiceActual = await leerArchivo(`${owner}/${name}/${indiceRuta}`);
  if (indiceActual) {
    // Si el indice existe pero no se puede leer, no se reescribe: se avisa para no
    // dejar el repositorio sin los presets que ya tenia.
    let leido;
    try {
      leido = JSON.parse(deBase64(indiceActual.content));
    } catch {
      throw new Error('El indice presets/index.json no se pudo leer. Corrigelo a mano y vuelve a intentarlo.');
    }
    if (Array.isArray(leido.presets)) indice = leido;
  }
  const entrada = {
    id,
    name: preset.name,
    description: preset.description || `${preset.options.length} opciones`,
    file: `${id}.json`,
    options: preset.options.length
  };
  const resto = (Array.isArray(indice.presets) ? indice.presets : []).filter((p) => p.id !== id);
  indice.presets = [...resto, entrada];
  await escribirArchivo(owner, name, indiceRuta, `${JSON.stringify(indice, null, 2)}\n`, `Indice de presets: ${preset.name}`);

  return { ruta, total: indice.presets.length };
}