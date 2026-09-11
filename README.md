# RXDSEC — portfolio & REX

The personal site of **RXDSEC**, a cybersecurity analyst working in offensive
security — VAPT, web application penetration testing, and AI red teaming. This
repository is the site itself: a fast, static, no-build portfolio plus the
download page for **REX**, the flagship desktop application.

**Live site:** deployed on Vercel from this repository's root.
**Downloads:** REX ships as prebuilt binaries on the [Releases](https://github.com/rxdsec634/REX/releases) page.

---

## What's here

This repo holds **only the website**. It is plain HTML, CSS and JavaScript —
no framework, no bundler, no build step. Every file can be opened and edited
directly.

```
index.html            RXDSEC — the portfolio home page
rex.html              REX — the flagship application
downloads.html        Downloads, rendered from data/downloads.json
pricing.html          Plans
account.html          Sign in / account (needs a backend — see below)

manifest.webmanifest  PWA manifest — the site installs to a home screen
sw.js                 Service worker (offline shell)
serve.mjs             Tiny static dev server
scan-art.mjs          Bakes assets/img/art/ into data/art.json for deploy
vercel.json           Hosting: security headers + cache policy

data/
  profile.json        Identity, links, skills, repo list — edit this, not the HTML
  downloads.json      Release manifest: REX builds + linked projects
  art.json            Hero artwork slides (ships empty)

assets/
  css/                The design system, both light and dark themes
  js/                 Background scene, effects, icons, downloads renderer
  img/                Marks, hero art, source imagery
files/                Drop-in downloadable files
```

The **application source for REX is not in this repo** — REX is distributed as
compiled binaries through GitHub Releases, not as source. This keeps the public
site clean and the app's build artifacts where they belong.

---

## REX

**An offensive-security and engineering agent that runs on your machine.** REX
pairs an agentic loop with native tool-calling over 23 model providers (cloud,
local and custom OpenAI-compatible), a permission gate with a hard safety
denylist, desktop control and browser automation, and a managed local GGUF
engine.

Get it from the [Downloads page](https://rxdsec.dev/downloads.html) or straight
from [Releases](https://github.com/rxdsec634/REX/releases):

| Platform | Artifact |
|----------|----------|
| Windows  | `REX Setup <version>.exe` (installer) · `REX <version>.exe` (portable) |
| Linux    | `rex_<version>_amd64.deb` (Debian/Ubuntu/Kali) · `rex-<version>-linux-x64.tar.gz` |
| macOS    | Build target configured; a signed artifact is not yet published |

Every build lists its SHA-256 on the download page — check it before you run.

---

## Other projects

Selected work from [github.com/rxdsec634](https://github.com/rxdsec634):

- **AiPentestFramework** — chains AI models with Nmap, Burp Suite and OWASP ZAP to automate recon and vulnerability assessment.
- **RXDSEC-CLI** — the command-line side of the toolkit, one Python entry point.
- **Bluedos / airmobile** — Bluetooth and Wi-Fi attack-surface auditing for authorised research and lab use.
- **rootmaster** — privilege and root-access tooling.

---

## Run the site locally

No dependencies — serve the folder with anything static:

```bash
# Node
npx serve .

# or Python
python -m http.server 8000
```

Then open the printed URL. The pages also work opened straight off disk
(`file://`); `downloads.html` carries an inline copy of its manifest for that
case, because browsers block `fetch()` of local files.

To edit content, change `data/profile.json` and `data/downloads.json` — the
pages render from those, so there's usually no HTML to touch.

---

## Deployment

Hosted on **Vercel** with the repository root as the site root (no Root
Directory setting needed). `vercel.json` sets the security headers and cache
policy. `cleanUrls` is deliberately left off, because rewriting `foo.html` to
`foo` would make the service worker's `cache.addAll` fail on the redirect and
take the offline shell down with it.

**Note:** the account/sign-in page calls `/api/v1/auth/*` on the same origin.
A static host has no backend, so sign-in stays inactive until the API is hosted
separately and proxied in.

---

## Links

- GitHub — <https://github.com/rxdsec634>
- YouTube — <https://www.youtube.com/@RXDSEC>
- LinkedIn — <https://www.linkedin.com/in/redweb-sec-2a4077240/>
- Instagram — <https://www.instagram.com/rxdsec/>

## License

MIT.
