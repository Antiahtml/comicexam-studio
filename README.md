# ComicExam Studio

Editor visual para crear **exámenes imprimibles a partir de cómics digitales** (`.cbr`, `.cbz` e imágenes).
Importas un cómic, recortas las viñetas con el ratón, las colocas en hojas A4 junto a tus preguntas y
exportas un PDF listo para imprimir. Todo funciona **en tu ordenador**: no hay cuentas, claves ni servicios externos,
y los cómics nunca salen de tu equipo.

---

## Índice

1. [Requisitos](#requisitos)
2. [Instalación y primer arranque](#instalación-y-primer-arranque)
3. [Comandos](#comandos)
4. [Cómo se usa](#cómo-se-usa)
5. [Arquitectura](#arquitectura)
6. [Modelo de datos](#modelo-de-datos)
7. [Importación de CBR/CBZ y seguridad](#importación-de-cbrcbz-y-seguridad)
8. [Exportación a PDF](#exportación-a-pdf)
9. [Pruebas](#pruebas)
10. [Verificación manual con un CBR real](#verificación-manual-con-un-cbr-real)
11. [Docker](#docker)
12. [Configuración](#configuración)
13. [Solución de problemas](#solución-de-problemas)
14. [Estado y limitaciones](#estado-y-limitaciones)

---

## Requisitos

| Dependencia | Versión | Para qué |
|---|---|---|
| Node.js | 20.9 o superior (probado con 24) | Ejecutar la aplicación |
| npm | 10 o superior | Instalar dependencias |
| Chromium de Playwright | se instala con `npm run setup` (~150 MB) | Generar los PDF |

**No hace falta instalar 7-Zip, unrar ni ningún programa del sistema.** La lectura de RAR (incluido **RAR5**) usa
`node-unrar-js`, que es el código oficial de *unrar* de RARLAB compilado a WebAssembly. La lectura de ZIP usa `yauzl`
y el procesamiento de imágenes `sharp` (binarios precompilados para macOS, Windows y Linux).

## Instalación y primer arranque

```bash
npm install
```

```bash
npm run setup
```

`setup` crea el archivo `.env` a partir de `.env.example` (si no existe), genera el cliente de base de datos, crea la base SQLite, descarga Chromium para Playwright y genera los cómics de prueba en `fixtures/`.

```bash
npm run dev
```

Abre <http://localhost:3000>.

Opcionalmente, carga un **examen de ejemplo** completo (importa el cómic de prueba, guarda viñetas y crea un examen de dos hojas):

```bash
npm run seed
```

> **Si el proyecto está en iCloud Drive** (como esta carpeta): las carpetas pesadas usan el sufijo `.nosync`
> para que iCloud no las sincronice: `node_modules → node_modules.nosync` (enlace simbólico),
> `.next.nosync` (compilación) y `data.nosync` (base de datos y cómics). En una instalación nueva dentro de
> iCloud, crea el enlace antes de `npm install`:
> `mkdir node_modules.nosync && ln -s node_modules.nosync node_modules`.
> Fuera de iCloud no hace falta nada de esto.

## Comandos

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo en <http://localhost:3000> |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm run setup` | Prisma + base de datos + Chromium + cómics de prueba |
| `npm run fixtures` | Regenera `fixtures/demo-comic.cbr` (RAR5) y `.cbz` (48 páginas) |
| `npm run seed` | Crea el examen de ejemplo y lo exporta a `examples/comprension-lectora.comicexam` |
| `npm test` | Pruebas unitarias y de integración (Vitest) |
| `npm run test:e2e` | Compila y ejecuta la prueba end-to-end (Playwright) |
| `npm run test:all` | Todas las pruebas |
| `npm run lint` · `npm run typecheck` | ESLint y TypeScript |
| `npm run db:push` | Aplica el esquema de `prisma/schema.prisma` a la base de datos |

## Cómo se usa

1. **Inicio → Nuevo examen.** Escribe el nombre (p. ej. «Comprensión lectora — Cómic»). El examen empieza con
   una cabecera con título, nombre del alumno, nota e instrucciones.
2. **Importa el cómic** desde la *Biblioteca de cómics* o desde la pestaña **Cómics** del editor: botón o
   arrastrar y soltar. Verás una barra de progreso mientras se extraen las páginas.
3. En el editor, pestaña **Cómics** → elige el cómic → haz clic en una página (p. ej. la 12): se abre el **visor**.
4. Con **Seleccionar viñeta** activo, dibuja un rectángulo sobre la viñeta. Ajusta esquinas y bordes o muévelo.
   Puedes hacer varias selecciones en la misma página. A la derecha ves la vista previa del recorte y sus píxeles originales.
5. **Añadir al examen** la inserta en la hoja activa (y la guarda en la biblioteca). **Guardar en biblioteca**
   solo la guarda (pestaña **Viñetas**). Marca dos viñetas y pulsa **Añadir una junto a otra** para colocarlas en fila.
6. Añade **preguntas** (respuesta corta o larga, opción múltiple, verdadero/falso, relacionar, pregunta sobre
   imagen), **espacios de respuesta** (líneas, cuadros, cuadrícula, tablas) y **formas** (separadores, líneas, rectángulos).
7. Arrastra, redimensiona (tiradores), gira, alinea, duplica o elimina. **Doble clic** en un texto para escribir.
   El panel derecho muestra las propiedades del elemento seleccionado; sin selección, las **capas** de la hoja.
8. Añade hojas, reordénalas en la tira inferior y mueve elementos entre hojas (arrastrándolos o con «Mover a la hoja»).
9. El examen se **guarda solo** (indicador arriba). **Vista previa** muestra el PDF final; **Exportar PDF** lo descarga
   con el nombre que elijas.

Atajos: `Supr` eliminar · `⌘/Ctrl D` duplicar · `⌘/Ctrl C/X/V` copiar/cortar/pegar · `⌘/Ctrl Z` deshacer
(`⇧` rehacer) · flechas mover 1 mm (`⇧` 10 mm) · `Alt` + arrastrar sin ajuste magnético · `⌘/Ctrl S` guardar ·
`⌘/Ctrl` + rueda zoom. En el visor: `←/→` páginas, `V` seleccionar, `H` mano, `+/−` zoom.

## Arquitectura

```
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · componentes estilo shadcn/ui (Radix + Lucide)
Zustand (estado del editor) · dnd-kit (orden de hojas y capas) · Prisma 6 + SQLite · Sharp · Playwright/Chromium
```

```
src/
├─ app/                         Rutas
│  ├─ (app)/page.tsx            Dashboard (exámenes recientes, biblioteca)
│  ├─ (app)/biblioteca/         Biblioteca de cómics (importación)
│  ├─ visor/[id]/               Visor de cómics + selección de viñetas
│  ├─ editor/[id]/              Editor de examen
│  ├─ editor/[id]/vista-previa/ Vista previa de impresión (PDF real y vista rápida)
│  ├─ print/[id]/               Documento sin controles: lo que Chromium convierte en PDF
│  └─ api/                      API REST local (cómics, medios, viñetas, proyectos, PDF)
├─ lib/
│  ├─ archive/                  Lector de archivos: detección por firma, extracción RAR/ZIP, orden natural, rutas seguras
│  ├─ images/                   Procesamiento de imágenes (validación, miniaturas, recortes con caché)
│  ├─ regions/                  Sistema de coordenadas normalizadas de las selecciones
│  ├─ comics/                   Importación de cómics (cola, progreso, recuperación)
│  ├─ document/                 Modelo del documento: tipos, validación Zod, unidades, fábricas, geometría
│  ├─ projects/                 Gestión de proyectos (repositorio, exportación/importación .comicexam)
│  └─ pdf/                      Exportación a PDF con Chromium
├─ components/
│  ├─ ui/                       Componentes base (botón, diálogo, menú, tooltip…)
│  ├─ comics/                   Biblioteca, visor, selector de regiones, importación
│  ├─ document/                 Renderizado del documento (COMPARTIDO por editor e impresión)
│  ├─ editor/                   Lienzo, hojas, paneles, propiedades, exportación
│  └─ dashboard/
└─ store/editor-store.ts        Estado del editor (documento, selección, historial, zoom)
```

Decisiones clave:

- **Unidades reales.** Posiciones y tamaños en **milímetros**; tipografía y grosores en **puntos**. El zoom del editor es
  solo un `transform: scale()` visual: nunca altera la maquetación ni el ajuste de líneas del texto.
- **Un único renderizador.** `components/document/` dibuja cada elemento con medidas `mm`/`pt`. Lo usan el editor
  (con controles alrededor) y la ruta `/print/[id]` (sin controles), así que **el PDF coincide con lo que ves**.
- **Selecciones normalizadas.** Las viñetas se guardan como `x, y, w, h ∈ [0, 1]` respecto a la imagen original,
  independientes del zoom y de la resolución mostrada. El recorte se hace en el servidor sobre el **original**.
- **Historial** de deshacer/rehacer (100 pasos) y **autoguardado** con *debounce* de 0,9 s.

## Modelo de datos

SQLite mediante Prisma (`prisma/schema.prisma`):

| Tabla | Contenido |
|---|---|
| `Comic` | Cómic o colección de imágenes: título, formato (`rar`, `zip`, `images`, `bundle`), estado, progreso, nº de páginas |
| `ComicPage` | Página: índice (orden natural), nombre en el archivo, rutas de original/miniatura/vista previa, tamaño en px |
| `Selection` | Viñeta guardada: página de origen + rectángulo normalizado + etiqueta |
| `Project` | Examen: nombre y documento JSON (validado con Zod al guardar e importar) |

El documento (`lib/document/types.ts`) contiene los datos del examen (título, asignatura, curso, fecha, puntuación,
instrucciones), la configuración de página (orientación, márgenes, cabecera, pie, numeración, fuente) y las hojas
con sus elementos (`text`, `image`, `question`, `lines`, `box`, `table`, `shape`, `examHeader`). Cada imagen guarda
la referencia al cómic, a la página y a la viñeta de origen, más el recorte normalizado.

Los archivos se guardan en `DATA_DIR` (por defecto `data.nosync/`):

```
data.nosync/
├─ comicexam.db
├─ comics/<id>/pages/0001.jpg | 0001.thumb.webp | 0001.preview.webp
├─ cache/crops/…               Recortes generados (se pueden borrar)
└─ tmp/                         Subidas en curso (aisladas, se borran al terminar)
```

**Exportar/importar proyectos:** el menú `⋯` del editor y del dashboard genera un archivo `.comicexam` (ZIP con
`comicexam.json` + las imágenes originales usadas). Al importarlo se crea una colección con esas imágenes y se
reasignan las referencias. Hay un ejemplo en `examples/comprension-lectora.comicexam` (se crea con `npm run seed`).

## Importación de CBR/CBZ y seguridad

Proceso (`lib/comics/import.ts` + `lib/archive/extract.ts`):

1. La subida se escribe en *streaming* a un directorio temporal aislado con nombre aleatorio (límite de tamaño configurable).
2. Se identifica el tipo **por la firma del archivo**, no por la extensión (un `.cbr` que en realidad es ZIP funciona).
3. Se leen las cabeceras y se **valida antes de extraer**: número de entradas, tamaño de cada imagen, tamaño total,
   **tasa de compresión** (anti bombas de descompresión), rutas peligrosas y entradas cifradas.
4. Se descartan entradas que no son imágenes, `__MACOSX`, archivos ocultos, `ComicInfo.xml`…
5. Se ordenan con **orden natural** (`pagina 2` antes que `pagina 10`; capítulos en subcarpetas).
6. Se extrae **una imagen cada vez** en memoria, se comprueba que su tamaño real coincide con el declarado,
   se valida con Sharp (tipo real, decodificable, límite de megapíxeles) y se generan miniatura y vista previa.
   El **original se conserva intacto** para el PDF.
7. El progreso se actualiza en la base de datos; la interfaz lo consulta sin bloquearse. Las importaciones se procesan
   en cola, de una en una, para no saturar memoria ni CPU.

Medidas de seguridad:

- **Zip Slip / path traversal imposible por diseño**: las páginas se guardan como `pages/0001.jpg`; el nombre
  de la entrada nunca se usa como ruta. Además se rechazan nombres con `..`, rutas absolutas o caracteres de control.
- **Sin shell ni procesos externos**: RAR se lee con WebAssembly y ZIP con JavaScript.
- No se ejecuta ni interpreta nada del contenido del archivo (solo se decodifican imágenes).
- Validación estricta (Zod) de todo documento guardado o importado; identificadores validados en la API.
- Los archivos nunca salen del equipo: no hay llamadas a servicios externos.

## Exportación a PDF

`GET /api/projects/:id/pdf` abre `/print/:id` en Chromium (Playwright), espera a que **todas las fuentes e imágenes
estén cargadas** y llama a `page.pdf()` con `@page { size: A4; margin: 0 }`. El resultado es un PDF **vectorial**
(texto real, seleccionable y nítido), no una captura de pantalla. Las viñetas se recortan del original **a resolución
completa**; el panel de propiedades indica los ppp efectivos al imprimir y avisa si bajan de 150.
Las fuentes están incluidas en la aplicación (paquetes `@fontsource`), por lo que el PDF es idéntico en cualquier equipo.

## Pruebas

```bash
npm test
```

59 pruebas (Vitest) que cubren:

- **Importación y ordenación**: CBR (RAR5) y CBZ reales generados al vuelo, orden natural, entradas ignoradas,
  el cómic de 48 páginas completo, rutas peligrosas, bombas de descompresión, archivos dañados, límites.
- **Conversión de coordenadas**: pantalla ↔ normalizado ↔ píxeles originales, independencia del zoom, redondeo.
- **Recuperación y persistencia de proyectos**: guardar y reabrir con posición/tamaño exactos, duplicar, borrar,
  rechazar documentos no válidos, exportar/importar `.comicexam`.
- **Exportación**: Chromium genera PDF A4 vertical/horizontal con una página por hoja.
- Modelo del documento: avisos de márgenes y solapes, numeración automática, ajuste magnético, alineación.

```bash
npm run test:e2e
```

Prueba **end-to-end** en un navegador real sobre la versión de producción, con datos aislados
(`test-data.nosync/e2e`): importar el CBR → abrir la página 12 → dibujar una selección con el ratón → añadir al
examen → pregunta con 4 líneas → página 20 con dos viñetas una junto a otra → segunda hoja → autoguardado →
recargar y comprobar que todo sigue → vista previa → descargar el PDF con nombre personalizado y comprobar A4,
número de páginas e imágenes a resolución original.

### Datos de prueba

No se incluye ningún cómic con derechos de autor. `npm run fixtures` **genera desde cero** un cómic de 48 páginas
(viñetas con figuras sencillas y globos que indican «Pág. N · V#»), en:

- `fixtures/demo-comic.cbr`: **RAR 5 real**. Como no existe un compresor RAR libre, se crea con un pequeño escritor
  RAR5 en modo *store* (`tests/helpers/rar5-writer.ts`) que sigue la especificación técnica pública de RAR 5.0.
  Lo lee y valida (CRC) el mismo *unrar* oficial que usa la aplicación.
- `fixtures/demo-comic.cbz`: ZIP equivalente.

## Verificación manual con un CBR real

Los CBR reales suelen estar **comprimidos** (no en modo *store*), en RAR4 o RAR5. La aplicación los descomprime con el
código oficial de *unrar*, así que no requieren pasos adicionales. Para comprobarlo:

1. `npm run dev` y abre <http://localhost:3000/biblioteca>.
2. Arrastra tu archivo `.cbr` (o `.cbz`). Debe aparecer la barra de progreso «Procesando página N de M…».
3. Al terminar, la tarjeta muestra la portada y el número de páginas. Ábrela: comprueba que el orden de las
   páginas es el correcto (navega con `←/→`).
4. Selecciona una viñeta, pulsa **Añadir a un examen…** y abre el examen.
5. En el panel de propiedades de la imagen, revisa los píxeles originales y los ppp al imprimir.
6. Exporta el PDF y amplíalo al 400 %: la viñeta debe verse con la nitidez del original y el texto debe ser seleccionable.

Casos que se rechazan con un mensaje claro: archivos protegidos con contraseña, RAR multivolumen (`.part1.rar`),
archivos dañados, archivos sin imágenes y archivos que superan los límites.

## Docker

Incluye Node.js y Chromium; los datos se guardan en el volumen `/data`.

```bash
docker compose up --build
```

Abre <http://localhost:3000>. (El `Dockerfile` usa la imagen oficial `mcr.microsoft.com/playwright:v1.64.0-noble`.)

## Configuración

Variables de entorno (archivo `.env`, ver `.env.example`):

| Variable | Por defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | `file:../data.nosync/comicexam.db` | Base SQLite (ruta relativa a `prisma/`) |
| `DATA_DIR` | `./data.nosync` | Carpeta de cómics, miniaturas, recortes y temporales |
| `MAX_UPLOAD_MB` | 1024 | Tamaño máximo del archivo subido |
| `MAX_ENTRY_MB` | 120 | Tamaño máximo de cada imagen descomprimida |
| `MAX_TOTAL_UNCOMPRESSED_MB` | 4096 | Tamaño máximo descomprimido de todo el archivo |
| `MAX_ARCHIVE_ENTRIES` | 3000 | Número máximo de entradas |
| `MAX_IMAGE_MEGAPIXELS` | 150 | Resolución máxima por imagen |
| `MAX_COMPRESSION_RATIO` | 50 | Relación descomprimido/comprimido máxima |
| `INTERNAL_BASE_URL` | `http://127.0.0.1:<puerto>` | URL con la que Chromium accede a la vista de impresión |

## Solución de problemas

- **«No se ha podido iniciar Chromium para generar el PDF»** → ejecuta `npx playwright install chromium`.
- **El PDF tarda la primera vez** → Chromium se inicia en la primera exportación (2–3 s); después se reutiliza.
- **Puerto ocupado** → `npm run dev -- -p 3001` (el PDF usa automáticamente el mismo puerto).
- **Empezar de cero** → detén el servidor, borra `data.nosync/` y ejecuta `npm run db:push`.

## Estado y limitaciones

**Terminado** (las piezas críticas, verificadas con las pruebas automáticas y en el navegador):
importación CBR/CBZ/imágenes con progreso (RAR5 y ZIP probados automáticamente; RAR4 y RAR **comprimido** los lee
el mismo *unrar* oficial, pero no he podido generarlos para las pruebas: verifícalo con un CBR real siguiendo la
sección anterior); visor con zoom, navegación, selección múltiple y por rangos;
selección manual de viñetas con tiradores, movimiento, varias por página, edición posterior y biblioteca de viñetas;
editor con hojas A4 vertical/horizontal, zoom, arrastrar, redimensionar, girar, alinear, distribuir, capas, duplicar,
copiar/pegar entre hojas, deshacer/rehacer, guías de márgenes, ajuste magnético y avisos de solape o de fuera de
márgenes; texto, imágenes, 6 tipos de pregunta, líneas, cuadros, cuadrícula, tablas, formas y cabecera del examen;
configuración del documento (datos, márgenes, encabezado, pie, numeración, fuentes); autoguardado; dashboard con
crear/abrir/renombrar/duplicar/eliminar; exportación e importación `.comicexam`; vista previa y PDF A4 con nombre personalizable.

**Limitaciones conocidas / ampliaciones futuras:**

- **Detección automática de viñetas**: no implementada (el modelo de selecciones ya la admite: bastaría con
  proponer rectángulos normalizados a partir del análisis de la página).
- El texto admite estilo por bloque (fuente, tamaño, negrita, cursiva, alineación, color), no formato mixto dentro
  del mismo párrafo.
- Redimensionar elementos **girados** usa el marco del elemento y puede desplazarlo ligeramente.
- No hay paginación automática: si una pregunta no cabe, el editor lo avisa y hay que moverla a otra hoja.
- Los RAR **multivolumen** y protegidos con contraseña no se admiten (se informa al usuario).
- Uso monousuario y local: no hay autenticación (no se debe exponer el servidor a Internet).
