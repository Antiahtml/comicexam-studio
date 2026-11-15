# ComicExam Studio

Editor visual para crear **exámenes imprimibles a partir de cómics digitales** (`.cbr`, `.cbz` e imágenes).
Importas un cómic, recortas las viñetas con el ratón, las colocas en hojas A4 junto a tus preguntas y obtienes
un PDF listo para imprimir.

**Es una web que funciona por completo en tu navegador.** No hay servidor ni cuentas: los cómics se abren y se
procesan en tu ordenador y **nunca se suben a Internet**, aunque la página esté publicada en GitHub Pages.

👉 **Usar la aplicación:** <https://antiahtml.github.io/comicexam-studio/>

---

## Índice

1. [Cómo se usa](#cómo-se-usa)
2. [Dónde se guardan tus datos](#dónde-se-guardan-tus-datos)
3. [Navegadores compatibles](#navegadores-compatibles)
4. [Desarrollo local](#desarrollo-local)
5. [Publicación en GitHub Pages](#publicación-en-github-pages)
6. [Arquitectura](#arquitectura)
7. [Seguridad al importar](#seguridad-al-importar)
8. [Pruebas](#pruebas)
9. [Estado y limitaciones](#estado-y-limitaciones)

---

## Cómo se usa

1. **Inicio → Nuevo examen** (o «Ver un examen de ejemplo» la primera vez).
2. **Importa el cómic** en la *Biblioteca de cómics* o en la pestaña **Cómics** del editor (botón o arrastrar y soltar).
   Una barra muestra el progreso mientras se extraen las páginas.
3. En el editor, **Cómics** → elige el cómic → haz clic en una página: se abre el **visor**.
4. Con **Seleccionar viñeta**, dibuja un rectángulo sobre la viñeta; ajusta esquinas y bordes o muévelo. Puedes
   hacer varias selecciones por página.
5. **Añadir al examen** la coloca en la hoja que estás viendo (y la guarda en la biblioteca). Marca dos viñetas y
   pulsa **Añadir una junto a otra** para ponerlas en fila. Si cierras el visor con viñetas sin guardar, te pregunta.
6. Añade **preguntas** (respuesta corta o larga, opción múltiple, verdadero/falso, relacionar, sobre imagen),
   **espacios de respuesta** (líneas, cuadros, cuadrícula, tablas) y **formas** (separadores, líneas, rectángulos).
7. Arrastra, redimensiona, gira, alinea, duplica o elimina. **Doble clic** en un texto para escribir. Lo nuevo va a
   la hoja que estás viendo; si no cabe, se crea una hoja nueva (con «Deshacer»).
8. El examen se **guarda solo** (indicador arriba).
9. **Exportar PDF** revisa antes el examen (textos que no caben, elementos fuera de la hoja, imágenes de poca
   resolución, nota total que no coincide con la suma…) y abre la **ventana de impresión** del navegador:
   elige tu impresora o **«Guardar como PDF»**. El nombre que escribas es el que se propone para el archivo.

Atajos: `Supr` eliminar · `⌘/Ctrl D` duplicar · `⌘/Ctrl C/X/V` copiar/cortar/pegar · `⌘/Ctrl Z` deshacer
(`⇧` rehacer) · flechas mover 1 mm (`⇧` 10 mm) · `Alt` + arrastrar sin ajuste magnético · `⌘/Ctrl` + rueda zoom.
En el visor: `←/→` páginas, `V` seleccionar, `H` mano, `+/−` zoom, `Esc` deselecciona.

### Consejos para el PDF

- En Chrome o Edge: destino **«Guardar como PDF»**, márgenes **Predeterminados** y escala **100 %**.
- Activa **«Gráficos de fondo»** si usas fondos de color en textos o cuadros.
- El PDF tiene texto real (nítido y seleccionable) y las viñetas a la resolución original del cómic.

## Dónde se guardan tus datos

Todo se guarda en el **almacenamiento del navegador** (IndexedDB) del equipo en el que trabajas:

- Si abres la web en **otro ordenador o en otro navegador**, no verás tus exámenes. Para llevarlos, usa
  **⋯ → Exportar examen (.comicexam)** y luego **Inicio → Importar examen** en el otro equipo. El archivo
  `.comicexam` incluye las imágenes que usa el examen.
- **Si borras los datos de navegación** de la web, se borran los cómics y exámenes. Haz copias exportando los
  exámenes importantes. La app pide al navegador que no borre los datos aunque falte espacio.
- En la *Biblioteca* se muestra cuánto espacio ocupan los datos.
- No funciona en **ventanas privadas o de incógnito** (el navegador no guarda nada en ellas).
- Los `.comicexam` de la versión anterior (con servidor local) se pueden importar sin cambios.

## Navegadores compatibles

Chrome, Edge y Firefox recientes, y Safari 16.4 o posterior. Se recomienda **Chrome o Edge**, que generan el PDF con
mejor fidelidad. La primera vez que se abre la web, tarda un instante en prepararse (registra un *service worker*).

## Desarrollo local

Requisitos: Node.js 20.9 o superior y npm.

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:3000>. Para probar la versión exactamente como se publica (en la subcarpeta `/comicexam-studio/`):

```bash
npm run build:pages && npm run preview:pages
```

y abre <http://127.0.0.1:3100/comicexam-studio/>.

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build:pages` | Compila la web estática en `out.nosync/` con la subcarpeta de GitHub Pages |
| `npm run preview:pages` | Sirve `out.nosync/` como lo haría GitHub Pages |
| `npm run setup` | Instala Chromium (para las pruebas) y genera los cómics de prueba |
| `npm run fixtures` | Regenera `fixtures/demo-comic.cbr` (RAR5) y `.cbz` (48 páginas, creados desde cero) |
| `npm test` | Pruebas unitarias e integración (Vitest) |
| `npm run test:e2e` | Compila y ejecuta la prueba end-to-end (Playwright) |
| `npm run lint` · `npm run typecheck` | ESLint y TypeScript |

> En iCloud Drive, las carpetas pesadas usan el sufijo `.nosync` para que iCloud no las sincronice
> (`node_modules → node_modules.nosync`, `.next.nosync`, `out.nosync`).

## Publicación en GitHub Pages

El flujo `.github/workflows/pages.yml` se ejecuta en cada `push` a `main`: instala dependencias, pasa las pruebas,
compila la web con la subcarpeta igual al nombre del repositorio y la publica en GitHub Pages. En
*Settings → Pages*, la fuente debe ser **GitHub Actions**.

Con una cuenta gratuita de GitHub, Pages solo está disponible para **repositorios públicos**: el código es visible,
pero los cómics y exámenes de cada persona nunca salen de su navegador.

## Arquitectura

```
Next.js 16 (exportación estática) · React 19 · TypeScript · Tailwind CSS 4 · componentes estilo shadcn/ui (Radix + Lucide)
Zustand (editor) · dnd-kit (orden de hojas y capas) · IndexedDB (idb) · Web Worker · Service Worker · unrar (WebAssembly) · fflate
```

```
src/
├─ app/                       Páginas estáticas (la entidad se indica con ?id=…)
│  ├─ (app)/page.tsx          Inicio: exámenes recientes, ejemplo, importar
│  ├─ (app)/biblioteca/       Biblioteca de cómics
│  ├─ visor/                  Visor de cómics + selección de viñetas
│  ├─ editor/                 Editor de examen
│  ├─ vista-previa/           Vista previa e impresión
│  └─ imprimir/               Documento sin controles: lo que se imprime o se guarda como PDF
├─ lib/
│  ├─ local/                  Datos en el navegador: IndexedDB, repositorio, worker de importación,
│  │                          procesamiento de imágenes, exportación/importación .comicexam
│  ├─ archive/                Lectura de CBR/CBZ: firma real, extracción segura, orden natural
│  ├─ regions/                Coordenadas normalizadas de las selecciones
│  ├─ document/               Modelo del examen: tipos, validación Zod, unidades, geometría, revisión
│  ├─ images/urls.ts          URLs de imágenes y recortes (las sirve el service worker)
│  └─ print.ts                Impresión / PDF con el navegador
├─ components/                Interfaz (biblioteca, visor, editor, renderizado del documento)
└─ store/editor-store.ts      Estado del editor (documento, selección, historial, zoom)
public/
├─ sw.js                      Service worker: sirve páginas y recortes desde IndexedDB
├─ unrar.wasm                 Descompresor oficial de RAR compilado a WebAssembly
└─ ejemplo.comicexam          Examen de ejemplo (con un cómic de prueba creado desde cero)
```

- **Importación en un Web Worker**: el archivo se lee, se valida y se procesa página a página sin bloquear la
  interfaz. Se conserva el **original** de cada página y se generan miniatura y vista previa.
- **Service worker de medios**: la interfaz pide imágenes con URLs normales (`/media/page/…`, `/media/crop/…`);
  el service worker las lee de IndexedDB y recorta las viñetas desde el original, guardando los recortes en caché.
- **Unidades reales**: posiciones en milímetros y tipografía en puntos. El zoom es solo visual. El editor y la vista de
  impresión usan el **mismo renderizador**, por eso el PDF coincide con lo que se ve.
- **Selecciones normalizadas** (`x, y, w, h ∈ [0, 1]`) respecto a la imagen original, independientes del zoom.

## Seguridad al importar

- Tipo real por **firma del archivo**, no por la extensión.
- Límites antes de descomprimir: número de entradas, tamaño por imagen y total, **tasa de compresión** (bombas de
  descompresión), rutas peligrosas (`..`, absolutas) y archivos con contraseña.
- Los nombres de las entradas **nunca** se usan como rutas: solo para ordenar y mostrar.
- Cada imagen se valida decodificándola; los datos de los archivos no se ejecutan ni interpretan.
- Los documentos guardados o importados se validan con Zod.
- Nada se envía a ningún servidor.

## Pruebas

```bash
npm run setup   # una vez: Chromium para Playwright y cómics de prueba
npm test
npm run test:e2e
```

- **Unitarias e integración (Vitest)**: extracción de CBR (RAR5) y CBZ con orden natural, rutas peligrosas, bombas
  de descompresión y archivos dañados; títulos legibles; coordenadas de selección; modelo del documento y revisión
  antes de imprimir; comportamiento del editor; persistencia de exámenes, viñetas y borrado seguro en IndexedDB
  (`fake-indexeddb`); exportación e importación de `.comicexam`; coherencia entre la app y el service worker.
- **End-to-end (Playwright)** sobre la web estática servida en `/comicexam-studio/`: importar el CBR → seleccionar
  viñetas (incluido el aviso de borradores) → insertar → preguntas → dos viñetas en fila → segunda hoja →
  autoguardado → recargar y comprobar que todo sigue → vista previa → revisión → imprimir con el nombre elegido →
  PDF A4 con número de páginas correcto e imágenes a resolución original → aviso al borrar un cómic en uso.

Los cómics de prueba (`fixtures/`) se **generan desde cero** con `npm run fixtures`: no hay contenido con derechos.
El `.cbr` es un RAR 5 real creado con un pequeño escritor en modo *store* (`tests/helpers/rar5-writer.ts`).

## Estado y limitaciones

- La versión anterior, con servidor local (Next.js + SQLite + Chromium), está en la etiqueta git `v1-servidor-local`.
- El PDF se obtiene con «Imprimir → Guardar como PDF» del navegador, no con descarga directa.
- Los datos viven en un único navegador (exporta `.comicexam` para copias o para cambiar de equipo).
- Cómics muy grandes (cientos de MB) necesitan memoria: si falla, cierra otras pestañas.
- No hay detección automática de viñetas ni formato mixto dentro de un mismo texto.
- RAR multivolumen y archivos con contraseña no se admiten (la app lo explica).
