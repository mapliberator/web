# mapliberator.com

The website for [MapLiberator](https://github.com/mapliberator/extension): the landing page and
the Portable Map Archive specification. Plain HTML and one stylesheet, no JavaScript.

```sh
npm install
npm run build        # writes the site to dist/
npm test             # every mapliberator.com URL resolves, no broken links, no scripts
```

`content/` holds the manifesto, the privacy policy, the preface to the specification and the stylesheet. The
specification itself, its JSON Schemas and the icon live in the
[extension repository](https://github.com/mapliberator/extension), where the schemas are generated
from the exporter's own code. The build and the tests clone its `main` branch. Set
`EXTENSION_DIR` to use a local checkout instead, for example to preview spec edits before they are
pushed:

```sh
EXTENSION_DIR=../mapliberator npm run build
```

The build writes:

| Path                                      | Source                               |
| ----------------------------------------- | ------------------------------------ |
| `/`                                       | `content/manifesto.md`               |
| `/spec/`                                  | `spec/portable-map-archive-*.md`     |
| `/spec/license/`                          | `spec/LICENSE.md`                    |
| `/privacy/`                               | `content/privacy.md`                 |
| `/spec/1.0-draft/schemas/*.json`          | `spec/schemas/`, each at its `$id`   |
| `/style.css`, `/icon.png`, `/favicon.png` | `content/style.css`, `public/icons/` |

The store buttons read "coming soon" until their URLs are filled in at the top of `build.ts`.

## Deploying

`vercel.json` sets the build command (`npm run build`) and the output directory (`dist`), so a
Vercel project needs no other settings. It also redirects `/spec` to `/spec/` and lets browsers
fetch the schemas from other origins. The site does not rebuild when the extension changes:
redeploy after a spec change is pushed.
