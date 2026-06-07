# slide-annotator.js

Librería standalone para anotar presentaciones HTML con herramientas de dibujo, exportación PDF y persistencia local.

## Instalación

### Via CDN (recomendado)

```html
<script src="https://cdn.jsdelivr.net/gh/luislmv85/slide-annotator@main/slide-annotator.js"></script>
```

Para fijar una versión específica (recomendado en producción):

```html
<script src="https://cdn.jsdelivr.net/gh/luislmv85/slide-annotator@v1.0.0/slide-annotator.js"></script>
```

### Local

Descarga `slide-annotator.js` y agrégalo al final del `<body>`:

```html
<script src="slide-annotator.js"></script>
```

No tiene dependencias externas. Las librerías de PDF (html2canvas, jsPDF) se cargan desde CDN bajo demanda al exportar.

## Uso básico

```html
<script src="slide-annotator.js"></script>
<script>
  SlideAnnotator.init({
    slides: '.slide',
    getSlideIndex: () => currentSlide,
    setSlideIndex: (n) => showSlide(n),
    pdfFilename: 'mi-presentacion.pdf'
  });
</script>
```

Después de cada cambio de slide, notifica a la librería:

```javascript
function showSlide(n) {
  // tu lógica de navegación...
  SlideAnnotator.onSlideChanged();
}
```

## Opciones de configuración

| Opción | Tipo | Default | Descripción |
|--------|------|---------|-------------|
| `slides` | string | `'.slide'` | Selector CSS de las diapositivas |
| `activeClass` | string | `'active'` | Clase CSS para slide visible |
| `storageKey` | string | pathname-based | Key en localStorage |
| `storageVersion` | number | `2` | Versión para migración de datos |
| `colors` | string[] | 9 colores | Paleta de colores |
| `theme` | string | `'dark'` | `'dark'` o `'light'` (afecta fondo de callouts) |
| `pdfFilename` | string | `'presentation.pdf'` | Nombre del PDF exportado |
| `getSlideIndex` | function | required | Devuelve el índice del slide actual |
| `setSlideIndex` | function | required | Navega al slide N (usado en PDF export) |
| `onSlideChange` | function | noop | Callback cuando el slide cambia |
| `cdnHtml2canvas` | string | jsdelivr 1.4.1 | URL del CDN para html2canvas |
| `cdnJspdf` | string | jsdelivr 2.5.2 | URL del CDN para jsPDF |

## Atajos de teclado

### Generales
| Tecla | Acción |
|-------|--------|
| `D` | Activar/desactivar modo dibujo |
| `H` | Ocultar/mostrar canvas (sin borrar) |
| `F` | Abrir popup 16:9 para presentar |
| `Ctrl+E` / `Cmd+E` | Exportar a PDF |
| `Escape` | Salir del modo dibujo |

### En modo dibujo
| Tecla | Herramienta |
|-------|-------------|
| `P` | Pluma (trazo libre) |
| `R` | Rectángulo (presionar de nuevo para toggle relleno) |
| `E` | Elipse (presionar de nuevo para toggle relleno) |
| `A` | Flecha |
| `T` | Callout (anotación con texto) |
| `X` | Tachado (crossout) |
| `L` | Puntero láser (trazo temporal) |
| `G` | Marcador/Highlighter (mantener G para trazo horizontal) |
| `C` | Selector de color |
| `Z` | Deshacer último trazo |
| `Delete` | Borrar todos los trazos del slide actual |

## API pública

```javascript
SlideAnnotator.init(options)      // Inicializar
SlideAnnotator.onSlideChanged()   // Notificar cambio de slide
SlideAnnotator.redraw()           // Redibujar canvas
SlideAnnotator.destroy()          // Limpiar (eliminar listeners y DOM)
```

## Persistencia

Los dibujos se guardan automáticamente en `localStorage` por slide. Se usa un formato versionado para permitir migraciones futuras. La key se deriva del pathname de la URL o se configura manualmente.

## Exportación PDF

Al presionar `Ctrl+E` (o `Cmd+E` en Mac), la librería:
1. Carga html2canvas y jsPDF desde CDN (si no están ya cargados)
2. Itera cada slide, captura en alta resolución (scale 2x)
3. Superpone las anotaciones del canvas
4. Agrega tooltips como anotaciones nativas del PDF
5. Genera y descarga el archivo

## Compatibilidad

- Navegadores modernos (Chrome, Firefox, Edge, Safari)
- No requiere bundler ni build step
- Zero dependencias en runtime (PDF libs se cargan on-demand)
