# slide-annotator.js

Standalone library for annotating HTML slide presentations with drawing tools, PDF export, and local persistence.

[Documentacion en Espanol](README-es.md)

## Installation

### Via CDN (recommended)

```html
<script src="https://cdn.jsdelivr.net/gh/luislmv85/slide-annotator@main/slide-annotator.js"></script>
```

Pin a specific version (recommended for production):

```html
<script src="https://cdn.jsdelivr.net/gh/luislmv85/slide-annotator@v1.0.0/slide-annotator.js"></script>
```

### Local

Download `slide-annotator.js` and add it at the end of `<body>`:

```html
<script src="slide-annotator.js"></script>
```

Zero runtime dependencies. PDF libraries (html2canvas, jsPDF) are loaded from CDN on demand when exporting.

## Basic Usage

```html
<script src="https://cdn.jsdelivr.net/gh/luislmv85/slide-annotator@v1.0.0/slide-annotator.js"></script>
<script>
  SlideAnnotator.init({
    slides: '.slide',
    getSlideIndex: () => currentSlide,
    setSlideIndex: (n) => showSlide(n),
    pdfFilename: 'my-presentation.pdf'
  });
</script>
```

After each slide change, notify the library:

```javascript
function showSlide(n) {
  // your navigation logic...
  SlideAnnotator.onSlideChanged();
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `slides` | string | `'.slide'` | CSS selector for slide elements |
| `activeClass` | string | `'active'` | CSS class for the visible slide |
| `storageKey` | string | pathname-based | localStorage key |
| `storageVersion` | number | `2` | Version number for data migration |
| `colors` | string[] | 9 colors | Color palette |
| `theme` | string | `'dark'` | `'dark'` or `'light'` (affects callout background) |
| `pdfFilename` | string | `'presentation.pdf'` | Output PDF filename |
| `getSlideIndex` | function | required | Returns the current slide index |
| `setSlideIndex` | function | required | Navigates to slide N (used in PDF export) |
| `onSlideChange` | function | noop | Callback when slide changes |
| `cdnHtml2canvas` | string | jsdelivr 1.4.1 | CDN URL for html2canvas |
| `cdnJspdf` | string | jsdelivr 2.5.2 | CDN URL for jsPDF |

## Keyboard Shortcuts

### General
| Key | Action |
|-----|--------|
| `D` | Toggle draw mode |
| `H` | Hide/show canvas (without deleting) |
| `F` | Open 16:9 popup for presenting |
| `Ctrl+E` / `Cmd+E` | Export to PDF |
| `Escape` | Exit draw mode |

### In Draw Mode
| Key | Tool |
|-----|------|
| `P` | Pen (freehand) |
| `R` | Rectangle (press again to toggle fill) |
| `E` | Ellipse (press again to toggle fill) |
| `A` | Arrow |
| `T` | Callout (text annotation) |
| `X` | Crossout (strikethrough) |
| `L` | Laser pointer (fading trail) |
| `G` | Highlighter (hold G for horizontal constraint) |
| `C` | Color picker |
| `Z` | Undo last stroke |
| `Delete` | Clear all strokes on current slide |

## Public API

```javascript
SlideAnnotator.init(options)      // Initialize
SlideAnnotator.onSlideChanged()   // Notify slide change
SlideAnnotator.redraw()           // Redraw canvas
SlideAnnotator.destroy()          // Cleanup (remove listeners and DOM)
```

## Persistence

Drawings are automatically saved to `localStorage` per slide using a versioned format for future migrations. The key is derived from the URL pathname or set manually.

## PDF Export

When pressing `Ctrl+E` (or `Cmd+E` on Mac):
1. Loads html2canvas and jsPDF from CDN (if not already loaded)
2. Iterates each slide, captures at high resolution (scale 2x)
3. Overlays canvas annotations
4. Adds tooltips as native PDF annotations
5. Generates and downloads the file

## Compatibility

- Modern browsers (Chrome, Firefox, Edge, Safari)
- No bundler or build step required
- Zero runtime dependencies (PDF libs loaded on-demand)

## License

MIT
