# Estilo de referencia: craft.do

Notas de diseño extraídas de https://www.craft.do (versión `/es`, escritorio 1440px, modo claro) con REA, en noviembre de 2026. **Son notas de referencia: todavía no se ha aplicado nada en ComicExam Studio.**

Convención: **Observado** = leído en la página o en su código. **Inferido** = deducción propia.

---

## 1. Tipografía

**Observado**

- Dos familias propias: *Untitled Sans* (texto, pesos 400 y 500) y *Untitled Serif* (titulares, peso 400). Respaldo: Inter / system-ui / Georgia.
- Los titulares van en **serif de peso 400**: es lo que da el aire editorial y de papel.
- Tracking negativo en titulares grandes (≈ −2 % a −3 %).

| Nivel | Tamaño | Interlineado | Tracking |
|---|---|---|---|
| H1 | 66px | 66px (1.0) | −1.98px |
| H2 | 54px | 59px (1.1) | −1.08px |
| H3 grande | 46px | 56px (1.22) | −1.38px |
| H3 | 36px | 44px (1.22) | −1.08px |
| Cuerpo | 16px | 24px (1.5) | — |
| Descripciones de menú | 14px | 120 % | — |

- Títulos de tarjeta de menú: 16px, peso 500.
- Citas de casos de uso: serif en cursiva.
- Etiquetas de sección: MAYÚSCULAS cortas (ESCRIBIR, IMAGINA, PLANEAR).
- Carga fuentes CJK solo para esos idiomas.

**Sugerencia (inferida):** serif de peso 400 con tracking −2/−3 % en titulares y sans de peso 400/500 para la interfaz. Alternativas libres: Source Serif 4 + Inter.

---

## 2. Paleta

**Observado**

| Token | Valor | Uso |
|---|---|---|
| `--color-beige` / `--background` | `#FCF9F7` | Fondo general (beige cálido, no blanco) |
| Texto | `rgb(3,3,2)` ≈ `#030302` | Negro casi puro con matiz cálido |
| `--color-black-100` | `#03030217` | Bordes |
| `--color-black-500` | `#03030280` | Texto secundario (50 %) |
| Texto inactivo de nav | negro al 50 % | Enlaces no activos |
| `--color-blue-4` | `#427E8A` | Acento / `--accent` |
| Verde pastel | `rgb(155,216,169)` | Chips de casos de uso |
| Amarillo | `rgb(253,233,155)` | Punto de color en menú móvil |
| `--radius` | `.625rem` (10px) | Radio base (estilo shadcn/ui) |

- Los tokens siguen la convención shadcn/ui (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`…).
- Paleta casi monocroma: color solo en acentos pastel, imágenes y la escena del hero (cielo azul + papel rasgado).

---

## 3. Movimiento

**Observado**

- Librería: Framer Motion (versión "motion"), con springs, `layoutCrossfade` y `data-framer-appear-id`.
- Easings: `cubic-bezier(0.4, 0, 0.2, 1)` (estándar, el dominante) y `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out fuerte). En JS: `[.4,0,.2,1]`, `[.4,0,.1,1]`, `[.25,.1,.35,1]`.
- Duraciones: 100 ms (blur de barra), 200 ms (hover de tarjetas, botones), 300–450 ms, 500 ms (brillo de botones de cristal, borde especular), 800 ms (entradas).
- Técnicas: `IntersectionObserver` + `requestAnimationFrame` (animaciones al scroll), View Transitions API (`startViewTransition`) en navegación, Embla en carruseles.
- Respeta `prefers-reduced-motion`.
- Hover de tarjetas del menú: `scale(1.05)` en 200 ms (escritorio); en móvil `translateX(8px)`.

**Sugerencia (inferida):** un solo easing `cubic-bezier(.4,0,.2,1)`, duraciones de 100 a 500 ms, y media query de movimiento reducido.

---

## 4. Estilo cristal (glass)

No es "Liquid Glass" con refracción real: es **blur ligero + degradado blanco translúcido + borde especular de 1px + sombra suave**.

### 4.1 Barra flotante (`<header>`)

Píldora flotante sobre el contenido.

| Propiedad | Valor |
|---|---|
| Posición | `fixed`, `top: 32px`, centrada |
| Ancho | `calc(100% - 48px)` móvil · `calc(100% - 96px)` y máx. 850px tablet · máx. 920px escritorio |
| Alto | 52px en reposo; ~288px con menú abierto |
| Radio | 26px |
| Relleno | `linear-gradient(180deg, #fff6 10%, #fffc)` |
| Blur | `blur(4px)` (transición 100 ms) |
| Sombra | `0 12px 12px 2px #0000001a, 0 2px 4px -1px #0000000f` |

Al hacer scroll: el blur sube a **12px** y la barra sube de `top:32px` a `top:16px`.

### 4.2 Borde especular (detalle clave)

```css
.glass-border::before{
  content:""; position:absolute; inset:0; pointer-events:none;
  border-radius: inherit; padding:1px;
  background: linear-gradient(rgba(255,255,255,.64) 40%, rgba(255,255,255,0) 75%, rgba(255,255,255,0) 95%, rgba(255,255,255,.64));
  mask: linear-gradient(#fff 0 0) content-box exclude, linear-gradient(#fff 0 0);
  transition: .5s ease-in-out;
}
```

Brillo arriba y abajo; zona central transparente. En el toggle: igual, con 0,5px.

### 4.3 Menú desplegable

- Al hacer clic, **la propia píldora se agranda** (52px → ~288px, `height` inline por JS) y el menú aparece dentro. No es un panel aparte.
- Cuadrícula de 3 columnas con tarjetas de radio 14px, `padding 12px`, fondo `bg-white/50` y icono de 24px.
- Algunas tarjetas llevan capa extra `opacity-50 mix-blend-overlay` (tinte de color).
- Hover: `scale(1.05)`, 200 ms, `cubic-bezier(.4,0,.2,1)`.
- Accesibilidad: `aria-expanded` + `aria-controls`; `focus-visible` con anillo blanco de 2px.

### 4.4 Botones de cristal (CTA)

- Píldora de 48px de alto, `padding 16px 32px`, peso 500, con la misma sombra y borde especular.
- Capa interna `.glass-button-gradient-bg`: `linear-gradient(180deg,#fff9,#ffffff96 25%,#fff9 50%,#ffffffd6 75%)` con `background-size: 300% 300%`.
- Hover: `background-position` de `50% 0` a `50% 70%` (brillo que se desliza, 500 ms) y sombra a `0 20px 25px 4px #0000001a, 0 10px 10px -5px #0000000a`.
- El botón primario es **negro sólido** (`bg-black`, texto blanco, `hover:bg-black-700`, `padding 8px 14px`, píldora).

### 4.5 Otras superficies

- **Tarjeta de producto:** `bg-white/80`, `backdrop-blur-md` (12px), borde `black/10` 1px, radio superior 16px, sombra `0 25px 50px -12px rgba(0,0,0,.4)`.
- **Bloques de contenido:** sombra apilada `0 50px 40px #00000003, 0 50px 40px #00000005, 0 20px 40px #0000000d, 0 3px 10px #00000014`.
- **Toggle:** fondo `linear-gradient(rgba(117,171,199,.24) 60%, #ffffffcc 90%)`.
- Existe también `backdrop-blur-[32px] + saturate(150%)` con fondo `rgb(250 250 250/.85)`; no se localizó qué elemento lo usa.

### 4.6 Por qué funciona (inferido)

1. Blur **bajo** (4–12px): se aprecia el fondo, el vidrio parece fino.
2. Degradado asimétrico (40 % arriba, 80 % abajo): da volumen.
3. Borde especular: lo que distingue "cristal" de "caja blanca transparente".
4. Un único easing y duraciones cortas.
5. Sombras grandes y casi invisibles.

### 4.7 Receta base (adaptación propia)

```css
:root{
  --glass-fill: linear-gradient(180deg,#fff6 10%,#fffc);
  --glass-shadow: 0 12px 12px 2px #0000001a, 0 2px 4px -1px #0000000f;
  --glass-shadow-hover: 0 20px 25px 4px #0000001a, 0 10px 10px -5px #0000000a;
  --ease: cubic-bezier(.4,0,.2,1);
}
.glass{ position:relative; background:var(--glass-fill);
  backdrop-filter:blur(4px); box-shadow:var(--glass-shadow);
  transition:backdrop-filter .1s var(--ease), box-shadow .5s var(--ease), transform .2s var(--ease);}
.glass.is-scrolled{ backdrop-filter:blur(12px); }
```

**Ojo:** el cristal solo se nota si hay algo detrás. En craft.do funciona porque el hero es una escena de cielo y papel. Con fondo liso habría que subir el blur (12–20px) o poner un fondo con color/degradado debajo.

---

## 5. Decoración "papel" (relacionado)

- Texturas `paper-texture.webp` y `paper-notebook.webp`.
- Máscaras SVG de papel rasgado (`paperShred*Mask`, `paperSheetMask`) aplicadas con `mask-image` y `mask-size: contain`.
- `drop-shadow(rgba(0,0,0,.05) 0 0 100px)` sobre el papel.

---

## 6. Estructura y ritmo

- Home de ~11.000px en 7 secciones (330–850px de alto).
- Ritmo vertical de 48 a 60px (`py-12`, `py-[60px]`, `gap-12/15/20`).
- Stack: Next.js (App Router) + Tailwind v4 + 13 idiomas.

---

## 7. Modo oscuro (explorado)

**Observado**

- **La web de marketing de craft.do NO tiene modo oscuro.** Con `prefers-color-scheme: dark` emulado, el fondo sigue en `#FCF9F7` y el texto en `#030302`. No hay ninguna regla `@media (prefers-color-scheme)` en sus hojas de estilo, ni `data-theme`, ni `color-scheme`, ni `<meta name="theme-color">`. Lo único que cambia con el tema del sistema son los **favicons** (`favicon-light.ico` / `favicon-dark.ico`, con media query).
- Sí existe un conjunto de tokens `.dark` (restos del esquema shadcn/ui, sin usar en la home):

| Token | Valor oscuro |
|---|---|
| `--background` | `oklch(14.5% 0 0)` ≈ `#0A0A0A` |
| `--foreground` | `oklch(98.5% 0 0)` |
| `--card` / `--popover` | `oklch(20.5% 0 0)` |
| `--primary` | `oklch(92.2% 0 0)` |
| `--secondary` / `--muted` / `--accent` | `oklch(26.9% 0 0)` |
| `--muted-foreground` | `oklch(70.8% 0 0)` |
| `--border` | `oklch(100% 0 0 / .1)` (blanco al 10 %) |
| `--input` | `oklch(100% 0 0 / .15)` |
| `--ring` | `oklch(55.6% 0 0)` |
| `--destructive` | `oklch(70.4% .191 22.216)` |

- Neutros puros (croma 0), sin matiz cálido: **no** reflejan la identidad beige de la web.
- **Lo oscuro que sí hay en la home** son superficies puntuales, no un tema:
  - **Footer:** tarjeta `bg-black` (`rgb(3,3,2)`), radio 24px, márgenes de 12px (16px en md), con **textura de grano/ruido** de papel. Texto blanco, columnas con cabecera en MAYÚSCULAS (14px, peso 500, `letter-spacing: .14px`) y línea divisoria fina, enlaces de 14px.
  - **Tarjetas de caso de uso** negras (280×280, radio 24px) y fondos `bg-black-900` en alguna imagen.
  - Botón primario negro sólido.
- La barra de cristal **no cambia de color sobre fondo oscuro**: sigue siendo un degradado blanco translúcido. Sobre el footer o secciones de color se tiñe con lo que hay detrás gracias al blur.

**Inferido**

- Para ComicExam Studio, un modo oscuro "al estilo Craft" tendría que **diseñarse propio**, no copiarse: la referencia no lo ofrece. Lo más coherente con su lenguaje sería:
  - fondo casi negro cálido (p. ej. `#0A0A09` en vez de neutro puro),
  - cristal invertido: degradado negro/blanco al 6–12 % con borde especular de blanco al 20–30 %,
  - texto `#F5F2EE` con secundario al 60 %,
  - superficies elevadas por **luminosidad** (cada nivel +4 % de L) en lugar de sombras,
  - mantener las mismas curvas y duraciones.
- Las sombras de cristal (`#0000001a`) casi no se ven sobre fondo oscuro; habría que compensar con el borde especular y un halo muy leve.
- Aprovechar los tokens `.dark` de arriba solo como base de contraste (bordes al 10 %, `muted-foreground` al 70 % de luminosidad), que son valores razonables y verificados por shadcn/ui.

---

## 8. Menú "Comunidad" (explorado)

**Observado**

- Mismo mecanismo que "Producto": el botón (`aria-expanded`, `aria-controls="header-community-menu"`) expande **la propia píldora de cristal**, esta vez de 52px a **~184px** de alto (Producto: ~288px). Ancho idéntico (920px en escritorio).
- Cuadrícula de **3 columnas** de tarjetas iguales, sin la columna lateral de enlaces que tiene Producto.
- Tres tarjetas, cada una con icono de marca de 24px, título y descripción:

| Tarjeta | Descripción | Destino |
|---|---|---|
| Comunidad de Reddit | "Discute, comparte y explora" | r/CraftDocsEs |
| Slack | "Obtén información exclusiva sobre las nuevas funciones" | `craft.do/community` |
| X / Twitter | "Mantente al día con nuestros últimos lanzamientos" | `x.com/craftdocsapp` |

- Estilo de tarjeta idéntico al del menú Producto: `rounded-xl` (14px), `padding 12px`, `bg-white/50`, título 16px peso 500, descripción 14px al 50 % de opacidad, hover `scale(1.05)` en 200 ms con `cubic-bezier(.4,0,.2,1)` (en móvil `translateX(8px)`).
- Los iconos de marca van **a todo color** (Reddit naranja, Slack multicolor, X negro sobre blanco con borde redondeado). Es el único punto de color del menú.
- Al abrir un menú, el texto del botón activo pasa a negro y los demás enlaces se quedan al 50 %.
- Con la barra encima de secciones de color (verde del bloque final, footer), el cristal **se tiñe** con el color de debajo: se ve el degradado verde a través del blur.

**Reutilizable (inferido):** un único componente "panel de cristal expandible" con N tarjetas, parametrizado por número de columnas y alto. Cada menú solo cambia el contenido y la altura.

---

## 9. Límites de lo explorado

- Solo escritorio (1440px). No se vio el menú móvil (hamburguesa).
- No se exploró la app real (docs.craft.do), que sí podría tener modo oscuro, porque exige iniciar sesión.
- La curva exacta de la animación de apertura del menú (JS) no se midió.
- No se midió el peso transferido ni el rendimiento real.
- No se comparó con las capturas de la app actual.

## 10. Siguientes pasos (cuando se decida implementar)

1. Fondo `#FCF9F7`, texto `#030302`, titulares en serif 400 con tracking negativo.
2. Variables `--glass-*` y clases `.glass` / `.glass-border`.
3. Barra flotante con comportamiento de scroll (blur 4 → 12px, `top` 32 → 16px).
4. Menús que expanden la propia píldora; hover `scale(1.05)`.
5. Movimiento con un solo easing + `prefers-reduced-motion`.
6. Modo oscuro propio (la referencia no lo tiene): ver sección 7.
7. Componente de panel de cristal expandible reutilizable para los menús (sección 8).
