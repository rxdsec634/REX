# web/ — rxdsec.dev

The RXDSEC site. Three static pages, no build step, no framework, no bundler.
Every file is plain HTML/CSS/JS you can open and edit.

```
web/
  index.html            RXDSEC — the person. Home page.
  rex.html              REX — the flagship project.
  downloads.html        Downloads, rendered from data/downloads.json.

  manifest.webmanifest  PWA manifest — the site installs to a phone home screen.
  sw.js                 Service worker (offline shell).
  serve.mjs             Static server for local development (+ /api/art).
  scan-art.mjs          Bakes assets/img/art/ into data/art.json for deploy.

  data/
    profile.json        Identity, links, stats, repo list. Edit this, not the HTML.
    downloads.json      Release manifest: builds + projects.
    art.json            Hero artwork slides. Ships empty.

  files/                Drop your own downloadable files here.

  assets/
    css/theme.css       The whole design system, both themes.
    js/scene.js         The background — raymarched sentinel + volumetric aura.
    js/fx.js            Preloader, cursor, reveals, theme, transitions, PWA.
    js/icons.js         Icon sprite.
    js/downloads.js     Renders downloads.html from the manifest.
    img/art/            Full-bleed hero artwork goes here.
    img/mark.svg        Favicon / app icon.
    img/rex-sigil.svg   REX project mark.
```

## Run it

```bash
node web/serve.mjs
```

Then open <http://localhost:4321/web/index.html>.

The server deliberately serves the **repository root**, not `web/`, so the
download links can reach the real artifacts in `dist-installer/`.

The pages also work opened straight off disk (`file://`). `downloads.html`
carries an inline copy of its manifest for that case, because Chromium blocks
`fetch()` of local files.

## Design

**Bone and ink.** Warm off-white paper, ink black, hairline rules, square
corners, oversized display type set tight, monospace only where a machine is
speaking. Colour is used exactly twice — violet for anything actionable, acid
green for anything that wants your eye.

**Dark is the default** and the house style; the site only starts light if the
visitor's OS explicitly asks for a light UI. The toggle lives in the nav and the
choice persists in `localStorage`. Dark is not a filter over light — it is the
same system with the paper and the ink swapped.

`.invert` sections flip against whatever the page currently is, so they always
read as a hard cut. Note the comment on that rule: a custom property redefined
in a rule also applies to that rule's *own* declarations, so `background:
var(--ink)` inside `.invert` resolves against the *new* `--ink` and paints the
section in its own text colour — bone on bone, display type invisible. The
element's own `background` and `color` are literals for exactly that reason.

### The background

Two layers, in this order: your artwork, then a raymarched aura over it in
`mix-blend-mode: screen`, so the energy reads as light moving through the scene
rather than a layer stacked on top of it.

The aura is a **participating medium** — the shader walks a ray through a 3D
density field built from domain-warped fBm noise and accumulates colour
front-to-back, the way real volumetric smoke is integrated. Its palette comes
from `--gl-edge` and `--gl-core` in `theme.css` and it watches `data-theme`, so
the CSS and the shader cannot drift apart. `data-power="0…1"` sets intensity per
section; with artwork present it is held low deliberately — the image is the
subject, this is only atmosphere.

Ray steps are **jittered per pixel** (`hash31` on `gl_FragCoord`). Without that
the slices align across neighbouring pixels and you get banding rings.

Budget: 34 steps x 4 fBm octaves on desktop, 20 x 3 on touch, at 58% / 40% of
viewport resolution. One resolution step-down if a device cannot hold frame
rate — never a spiral.

An earlier version also marched a hard-surface sentinel head in the same shader.
It has been removed. Two notes survive it, because both cost real time and both
generalise: a face plate built on +Z faces *away* from a camera that looks down
+Z, and dark metal on a near-black page renders perfectly while being completely
invisible.

### Sharpness

The artwork cannot gain detail it does not have — a 1600x900 source is 1600x900,
and upscaling only interpolates. What the CSS does is stop *losing* detail:

- `inset` on `.art-slide` is `-2%` (desktop) / `-1%` (portrait), not `-7%`
- Ken Burns runs `scale(1.005 → 1.045)`, not `1.05 → 1.16`

Both of those were extra upscaling stacked on top of `background-size: cover`.
Held near 1.0, the image draws as close to native as the viewport allows. A
light `contrast(1.08) saturate(1.10)` grade reads as crispness without the halos
a sharpen filter would give you.

If you want genuine 4K, re-generate or re-export the source at that size. Do not
run it through an upscaler and expect detail.

### Portrait

A 16:9 image on a portrait phone is the hard case: `cover` scales it to fill the
height and only about a quarter of its width survives the crop. Three things
keep it readable — a shallower inset, a gentler Ken Burns so the crop does not
tighten further, and `background-position: 50% 30%` so the subject stays in
frame instead of the floor.

On desktop the per-slide `focus` is `62% 45%`, which pushes the subject into the
empty right half rather than leaving it centred behind the headline.

### Colour grading

The dark neutrals are warmed toward the artwork (`--paper: #0a0708`, not a
neutral `#0b0b0c`) so the page reads as one scene instead of a warm photograph
pasted onto cold grey. It is a nudge, not a tint.

The accent moved from ultramarine to crimson for the same reason — a violet CTA
on a red-black photograph reads as a mistake. Acid green stays as the single
non-red signal, used in about four places.

The hero also carries a `::before` scrim over everything. Body copy sitting
straight on the bright part of an image is unreadable; desktop weights it left
where the copy is, portrait switches to full-width and drops the canvas to 62%
opacity. `dim` in `art.json` (currently `0.52`) controls how hard the artwork
itself is washed — **raise it if the headline stops reading.**

### Adding your own artwork

Two slots, and the shape of your image decides which one you want.

**Cut-out subject** — a figure with transparency, mounted over the page. This is
what the hero uses now.

```
web/assets/img/figure.webp      full size, desktop
web/assets/img/figure@sm.webp   half size, phones
```

`fx.js` swaps to the `@sm` file on coarse pointers automatically — shipping a
1200px asset to a 375px screen is most of a megabyte for pixels nobody can
resolve. Point the hero at it:

```html
<header class="hero" data-power="0.55" data-figure="assets/img/figure.webp">
```

It mounts centred — the artwork is composed as a poster, so the middle of the
frame is where it belongs — with pointer parallax that moves *less* than the
aura, `rotateX`/`rotateY` tilt on a 1400px perspective, a breathing backlight,
a screen-blended haze passing in front, and a scan sweep.

The scan is masked by **the artwork's own alpha**, so it runs across the figure
and never across the empty space around it. One trap: the mask URL is set as an
absolute URL from JS on purpose — a relative `url()` inside a custom property is
resolved against the stylesheet that consumes it, not the document, so a
relative path 404s as `/assets/css/assets/img/...`.

**Full-bleed wallpaper** — a whole scene, no transparency, behind everything.
Drop files in `web/assets/img/art/` and they are picked up automatically (the
dev server lists the folder over `/api/art`; run `node web/scan-art.mjs` before
deploying, since a static host cannot list a directory). Settings live in
`data/art.json`: `interval`, `fade`, `dim`, and per-slide `focus`.

The two do not mix well, and there is a trap worth knowing: emptying `slides` in
`art.json` makes the layer fall back to folder discovery. If the cut-out lives in
that folder it gets mounted as a full-bleed background as well. That is why the
cut-out sits in `assets/img/` and the folder is only for wallpapers.

`assets/img/source/` holds the untouched original so the crop can be redone.

### Preparing a cut-out

The hero art is keyed from `assets/img/source/hero-original.jpg` with PIL. The
source is a poster composition — subject centred, glow radiating out — on near
black, so the pipeline is:

1. **Resample** 1.6x with Lanczos, then unsharp mask. This invents nothing; it
   resamples better than the browser would and lifts local contrast, which is
   what actually reads as sharper. For genuine 4K, re-generate the source at
   that size rather than upscaling.
2. **Key by luminance** for the glow and the ring — those are pure light and
   should stay soft-edged rather than be clipped to a silhouette.
3. **Flood fill from the frame border** for solidity. A luminance key alone eats
   the robot's shadowed torso and legs and leaves it hollow. The real background
   is the black *connected to the border*; black that is enclosed is inside the
   body, so it stays opaque.
4. **Lift the black floor above JPEG noise.** Keying from luminance 3 left a
   faint ~0.1-alpha rectangle across the whole frame, because a JPEG's "black"
   sits around 4-12 with block noise. The floor is 16, with a hard cut below
   0.06 alpha.
5. **Fade the frame edges** so anything running off the crop dissolves instead
   of ending in a hard line.

Exports `figure.webp` (2560x1440) and `figure@sm.webp`, and `fx.js` picks the
small one on coarse pointers.

### How the figure behaves on scroll

It never leaves. It eases from full strength in the hero down to a faint,
defocused presence that carries the rest of the page:

| Position | Opacity | Blur |
|---|---|---|
| Hero | 1.00 | 0 |
| Intro arriving | ~0.40 | ~2.5px |
| Every section below | 0.20 | 3.2px |

`FLOOR` in `fx.js` is what it settles at. It has to stay low enough that body
copy sitting over it is comfortable — at 0.20 over `--paper`, `--ink-2` text
still clears 4.5:1 against the brightest part of the artwork.

The **defocus matters as much as the opacity**. At the floor the artwork sits
behind body copy in every section, and a sharp picture competes with text even
when it is faint; a blurred one reads as atmosphere. The blur is applied to
`.figure-holder`, not the `img`, because the image already runs a
`drop-shadow` keyframe animation and two `filter` declarations on one element
would fight.

The hand-off is measured against the **section after the hero**, not a scroll
distance. The page names it:

```html
<header class="hero" data-figure="…" data-figure-until="#about">
```

`index.html` points at `#about`, `rex.html` at `#what`. Without the attribute it
falls back to the first `<section>` after the hero — which is a marquee on one
page and real content on the other, hence the attribute. The window is 1.45
viewports and smoothstepped, so the transition lands across the intro rather
than snapping at its top edge.

Z-order, since the artwork is now under the whole page: figure `0`, haze `1`,
content `2`. Panels, the footer and `.invert` blocks have solid backgrounds and
cover it; it shows through the transparent gaps between them, which is the point.

A background tab does not run `requestAnimationFrame`, so the fade re-syncs on
`visibilitychange` — otherwise a scroll that happened while hidden leaves the
artwork at the wrong opacity.

### The centred hero

With a figure present the hero switches to a centre composition — the artwork is
already arranged as a poster, so anything but the middle of the frame fights the
composition baked into it. `html.has-figure:not(.has-art)` centres the copy,
widens the measure, and adds text-shadows.

Two things that bit and will bite again:

- **Stacking inside the hero.** The figure layer is appended *after* the hero
  content, so at an equal `z-index` the artwork painted over the headline, and
  the scrim sat under the artwork dimming nothing. The order is now explicit:
  figure `0`, haze `1`, `.hero::before` scrim `2`, `.hero-inner` copy `3`.
- **The scrim is shaped to the layout, not even.** It opens through the upper
  middle where the ring and head are, and gets heavy from 70% down where the
  lede sits. The headline survives the clear band on its text-shadow alone, and
  the kicker gets its own backing because it lands on the brightest part of the
  artwork.

On portrait the 16:9 poster is allowed to overflow the sides (`width: 190vw`)
rather than being fitted by width, which would shrink the subject to nothing.

### The REX interface mockup

`rex.html` carries a depiction of the actual app — three panes, streaming
transcript, inline tool cards, an editable diff waiting on approval, detail
pane, status bar. It is styled from its own scoped tokens (`--g-*` on `.gui`),
not the site's, so it reads as a screenshot of the product rather than as more
website.

It uses the app's **purple** accent, which is one of the accents REX actually
ships (Settings -> Appearance), so the depiction stays honest while still
sitting inside the site's palette.

### The REX sigil

REX has its own mark: a hexagonal perimeter, a bolt fracturing through it, and a
bar beneath that never moves — perimeter, breach, denylist. It is drawn inline
in `rex.html` so it inherits `currentColor`, and stands alone in
`assets/img/rex-sigil.svg`.

## Editing your identity

`data/profile.json` is the record: handle, title, summary, capability areas,
skills and repo blurbs.

**This file is served publicly at `/data/profile.json`.** Anything in it is on
the internet. It deliberately does not contain:

- legal name
- phone number or email address
- city or address
- employer names and dates
- university, degree or graduation year
- certification list

Experience is stated as a duration only — `"yearsExperience": "2+"` — and the
capability areas describe *what* was done without naming *where*. Do not paste
a CV back in wholesale; that undoes all of the above in one edit.

Contact routes through the GitHub / LinkedIn / YouTube / Instagram links.

**One conflict worth knowing.** A CV describing REX as *Python, Local LLMs
(GGUF), LangChain* does not match the repository in this workspace, which is an
**Electron + React + TypeScript monorepo** with the agent core in the Electron
main process. The site describes the code, because that is what is verifiable
and what people download.

## Adding a download

1. Put the file in `web/files/`.
2. Add an entry to `web/data/downloads.json`.

A **build** (appears under the platform tabs):

```json
{
  "id": "my-tool-win",
  "os": "windows",
  "osLabel": "Windows",
  "title": "MyTool 1.0.exe",
  "subtitle": "One line about what it is and who it's for.",
  "primary": true,
  "size": 12345678,
  "sha256": "…",
  "url": "files/MyTool-1.0.exe",
  "tags": ["x64", "portable"],
  "install": "sudo apt install ./mytool.deb",
  "verify": "sha256sum MyTool-1.0.exe"
}
```

A **project** (appears in the Releases list):

```json
{
  "name": "My Tool",
  "kind": "CLI",
  "blurb": "What it does, in a sentence.",
  "tags": ["Python", "MIT"],
  "url": "files/mytool-1.0.zip",
  "repo": "https://github.com/rxdsec634/mytool"
}
```

`status` changes how a build renders: `"pending"` shows a *planned* badge with
no download button; `"repo"` turns the button into an "Open repo" link.

Size and hash:

```bash
stat -c%s FILE && sha256sum FILE
```

```powershell
(Get-Item FILE).Length
certutil -hashfile FILE SHA256
```

`downloads.html` ends with a `<script id="dl-fallback">` holding the same JSON,
used only over `file://`. If you serve over HTTP you can ignore it; if you hand
someone the folder, update both.

## Publishing

Any static host works. Two things to change first:

1. **Download URLs.** They point at `../dist-installer/`, which only exists in
   this repo. For a public site, point them at GitHub Releases — those
   installers are 86–116 MB each — or copy them into `web/files/`.
2. **Publish root.** If you deploy `web/` as the site root, the `../dist-installer`
   paths break. Same fix as (1).

The service worker uses network-first for documents, scripts, styles and JSON,
and cache-first only for images and fonts, so a deploy reaches visitors
immediately instead of pinning them to an old build. Release artifacts are never
cached.
