# assets/img/art/

Full-bleed hero artwork goes here.

1. Save your images in this folder (JPG, PNG or WebP — 1920×1080 or larger).
2. List them in `web/data/art.json`:

```json
"slides": [
  { "src": "assets/img/art/01.jpg", "focus": "center" },
  { "src": "assets/img/art/02.jpg", "focus": "center top" }
]
```

`focus` is a CSS `background-position` — use it to keep the important part of
the image in frame when it gets cropped on a different aspect ratio.

Nothing is shipped here, so the layer stays off until you add files.
