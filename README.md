# Ruleta

Web estática para sortear opciones de un minijuego, una ronda de castigo, un
casting o lo que haga falta. No usa librerías JavaScript, no tiene paso de
compilación y no necesita servidor. Se publica con GitHub Pages y se abre
directamente en el navegador.

La única dependencia externa son las tipografías, que se cargan desde Google
Fonts en `css/style.css`. Si no hay conexión, el navegador usa las fuentes de
sistema y el resto sigue funcionando.

**Web:** https://alejandrlucena.github.io/ruleta/

## Modos de juego

| Modo | Cómo funciona |
| --- | --- |
| **Individual** | Una sola ruleta con todas las opciones. |
| **Equipos** | Dos equipos. Cada jugador tira solo con las opciones asignadas a su equipo y los turnos se alternan. |
| **1 vs 1** | Dos variantes: *Lista común* (ambos tiran sobre la misma lista, una tirada por pulsación y turno alterno) y *Ruletas propias* (cada jugador tira con sus propias opciones). |

En los modos por turnos hay un marcador con los resultados de cada jugador.

## Opciones y archivos

- **Las opciones que añades tú se guardan solo en tu navegador.** No se
  sincronizan entre dispositivos ni se suben al repositorio por sí solas.
- Los **presets** sí viven en el repositorio, en `presets/`, y se cargan desde
  `presets/index.json`.
- Al recargar la página se limpian las opciones de la ronda en curso, el
  historial y los turnos. Se conservan las preferencias (modo, equipos,
  interruptor de retirar, volumen y paneles plegados).
- Cada opción necesita una imagen. Al añadirla se recorta a 240x240 y se
  guarda en Base64 dentro del JSON, por eso los presets pesan bastante.
- `Retirar resultado` quita la opción de las siguientes tiradas.

## Publicar un preset

Hay dos caminos.

### Desde el móvil o el navegador: botón «Publicar en GitHub»

1. Pulsas **Guardar mis opciones como preset** para preparar el JSON.
2. Pulsas **Publicar en GitHub**.
3. La primera vez te pide un token personal. Créalo en
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):
   - nombre: `Ruleta`;
   - repositorio: **solo** `Alejandrlucena/ruleta`;
   - permisos: **Contents: Read and write**, todo lo demás en *No access*.
4. Pegas el token y publicas. Se sube `presets/<nombre>.json` y se actualiza
   `presets/index.json`.

El token se guarda en `sessionStorage`, o sea que **solo vive en esa pestaña** y
desaparece al cerrar el navegador. Hay un botón para desconectarlo.

> **Por qué un token y no un login normal con GitHub:** GitHub no envía cabeceras
> CORS en su flujo OAuth de dispositivo, así que una web estática no puede
> iniciar sesión por su cuenta (`fetch` falla con `Failed to fetch`). La API
> `api.github.com` sí admite CORS, de ahí el token. Por eso el token no se puede
> evitar sin montar un servidor intermedio.

Para publicar en otro repositorio: `?repo=usuario/repositorio` en la URL.

### Desde el ordenador: `guardar-preset.ps1`

Descargas el JSON con **Descargar config.json** y lo publicas con:

```powershell
.\guardar-preset.ps1 -Archivo ".\mi-preset.json" -Nombre "Cena de navidad" -Musica ".\musica\navidad.mp3"
```

El script copia el MP3 a `musica/`, valida el JSON, actualiza el índice y sube
los cambios con la CLI de GitHub. Necesitas `gh` autenticado y Powershell.

## Música

Se indica en `config.json` o en el propio preset:

```json
"music": { "src": "./musica.mp3", "volume": 45, "autoplay": true }
```

`src` es una ruta **relativa a `index.html`**, y el archivo tiene que estar en el
repositorio. Por defecto usa `./musica.mp3`. El MP3 que subas con *Elegir MP3*
solo se usa en esa sesión del navegador, no se guarda en el preset.

El volumen se ajusta con el botón de silenciar; la barra se quitó. Ten en cuenta
que los navegadores **bloquean el autoplay** hasta que el usuario interactúa, así
que en la primera visita la música arrancará con el primer toque o clic.

## Estructura

```
index.html            maquetación y controles
config.json           opciones y música iniciales publicadas
musica.mp3            canción por defecto
favicon.svg
css/style.css
js/app.js             estado, modos, turnos, interfaz
js/roulette.js        dibujo de la ruleta y animación del giro
js/storage.js         normalización de datos, presets y persistencia
js/audio.js           música, silenciar y desbloqueo de autoplay
js/github.js          publicación vía API de GitHub
presets/index.json    índice de presets disponibles
presets/*.json        los presets
guardar-preset.ps1    publicación desde el ordenador
```

Sin librerías ni paso de compilación: los módulos ES se cargan tal cual con
`?v=` para saltarse la caché del navegador. Al tocar JS o CSS hay que subir el
número de versión en `index.html`.

## Notas

- Los presets se piden con `cache: 'no-store'`, así que una publicación nueva se
  ve sin recargar a mano, pero GitHub Pages tarda unos segundos en reconstruir.
- `presets/index.json` es la fuente de la lista. Si algún día queda corrupto, el
  botón de publicar se niega a sobrescribirlo en vez de dejar el repositorio sin
  presets.