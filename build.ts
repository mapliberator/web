/**
 * Builds mapliberator.com into dist/: the landing page (content/manifesto.md), the Portable Map
 * Archive specification, and the JSON Schemas at the URLs their `$id`s name. Plain HTML and one
 * stylesheet, no JavaScript; any static host can serve the output.
 *
 * The specification, its schemas and the icon live in the extension repository, which the build
 * clones (main, depth 1). Set EXTENSION_DIR to a local checkout to build from that instead, e.g.
 * to preview spec edits before they are pushed. `tests/site.test.ts` checks that every
 * mapliberator.com URL in the extension and the schemas resolves, and that no internal link is
 * broken.
 *
 *   npm run build
 *   EXTENSION_DIR=../mapliberator npm run build
 */
import { execFileSync } from 'node:child_process';
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(ROOT, 'content');
const SPEC_VERSION = '1.0-draft';
const REPO = 'https://github.com/mapliberator/extension';

export const SITE_ORIGIN = 'https://mapliberator.com';

/** Store listings. Leave a URL empty until the listing is live; its button then says so. */
const STORES = [
	{ browser: 'Chrome', url: '' },
	{ browser: 'Firefox', url: '' }
];

interface Rendered {
	html: string;
	/** Level-2 headings, for a table of contents. */
	toc: { id: string; title: string }[];
	ids: Set<string>;
}

/** `6.1 \`geometrySource\`` → `sec-6.1`; unnumbered headings get a slug. */
function headingId(text: string, taken: Set<string>): string {
	const number = /^(\d+(?:\.\d+)*)\.?\s/.exec(text)?.[1];
	const base = number
		? `sec-${number}`
		: text
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
	let id = base;
	for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
	taken.add(id);
	return id;
}

function renderMarkdown(source: string, link: (href: string) => string = (href) => href): Rendered {
	const toc: Rendered['toc'] = [];
	const ids = new Set<string>();
	const marked = new Marked({
		gfm: true,
		walkTokens(token) {
			if (token.type === 'link') token.href = link(token.href);
		},
		renderer: {
			heading({ tokens, depth, text }) {
				const inner = this.parser.parseInline(tokens);
				if (depth === 1) return `<h1>${inner}</h1>\n`;
				const id = headingId(text, ids);
				if (depth === 2) toc.push({ id, title: inner });
				return `<h${depth} id="${id}"><a href="#${id}">${inner}</a></h${depth}>\n`;
			}
		}
	});
	const html = (marked.parse(source) as string)
		.replaceAll('<table>', '<div class="table-wrap"><table>')
		.replaceAll('</table>', '</table></div>');
	return { html, toc, ids };
}

/** Links "§5.1" to its section wherever that section exists, outside code, links and headings. */
function linkSections(html: string, ids: Set<string>): string {
	return html
		.split(
			/(<pre[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>|<h[1-6][\s\S]*?<\/h[1-6]>)/
		)
		.map((part, index) =>
			index % 2 === 1
				? part
				: part.replace(/(?<!§)§(\d+(?:\.\d+)*)/g, (ref, number: string) =>
						ids.has(`sec-${number}`) ? `<a href="#sec-${number}">${ref}</a>` : ref
					)
		)
		.join('');
}

/** Site path of each schema, taken from its `$id` so that the `$id` resolves. */
function schemaPaths(specDir: string): Map<string, string> {
	const paths = new Map<string, string>();
	for (const name of readdirSync(join(specDir, 'schemas')).sort()) {
		const { $id } = JSON.parse(readFileSync(join(specDir, 'schemas', name), 'utf8')) as {
			$id?: string;
		};
		if (!$id?.startsWith(`${SITE_ORIGIN}/`))
			throw new Error(`${name}: $id is not on ${SITE_ORIGIN}`);
		paths.set(name, $id.slice(SITE_ORIGIN.length));
	}
	return paths;
}

/** Relative links in spec/*.md point at files next to it in the repository. */
function specLink(schemas: Map<string, string>) {
	return (href: string): string => {
		if (/^(https?:|mailto:|#)/.test(href)) return href;
		if (href === 'LICENSE.md') return '/spec/license/';
		if (href === 'schemas/') return '#sec-1.1';
		const schema = schemas.get(href.replace(/^schemas\//, ''));
		if (href.startsWith('schemas/') && schema) return schema;
		throw new Error(`spec: no site URL for the relative link "${href}"`);
	};
}

function escapeHtml(text: string): string {
	return text.replace(
		/[&<>"]/g,
		(char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char
	);
}

function page(options: {
	path: string;
	title: string;
	description: string;
	body: string;
	bodyClass?: string;
}): string {
	const { path, title, description, body, bodyClass } = options;
	const nav = [
		{ href: '/', label: 'Manifesto' },
		{ href: '/spec/', label: 'Specification' },
		{ href: REPO, label: 'GitHub' }
	]
		.map(
			({ href, label }) =>
				`<a href="${href}"${href === path ? ' aria-current="page"' : ''}>${label}</a>`
		)
		.join('');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_ORIGIN}${path}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${SITE_ORIGIN}${path}">
<meta property="og:image" content="${SITE_ORIGIN}/icon.png">
<link rel="icon" href="/favicon.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="stylesheet" href="/style.css">
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<header class="site-header">
<div class="container">
<a class="brand" href="/"><img src="/icon.png" alt="" width="32" height="32">MapLiberator</a>
<nav>${nav}</nav>
</div>
</header>
${body}
<footer class="site-footer">
<div class="container">
<p>MapLiberator is <a href="${REPO}">open source</a> under the MIT license. The specification is
licensed <a href="/spec/license/">CC BY 4.0</a>. This site sets no cookies and runs no analytics.</p>
<p>Gaia GPS, AllTrails and Strava are trademarks of their respective owners. MapLiberator is not
affiliated with any of them.</p>
</div>
</footer>
</body>
</html>
`;
}

function storeButtons(): string {
	const buttons = STORES.map(({ browser, url }) =>
		url
			? `<a class="btn btn-primary" href="${url}">Add to ${browser}</a>`
			: `<span class="btn btn-primary" aria-disabled="true">Add to ${browser} <small>coming soon</small></span>`
	).join('\n');
	const pending = STORES.some(({ url }) => !url)
		? ` It isn't in the browser stores yet, but the <a href="${REPO}">source is on GitHub</a>.`
		: '';
	return `<div class="install">
${buttons}
</div>
<p class="fine">Works with Gaia GPS and AllTrails, in Chrome, Edge, Brave and Firefox.${pending}</p>`;
}

const ARCHIVE_TREE = `mapliberator-gaiagps-2026-09-21.zip
├── tracks/           <span>GPX + metadata, one per track</span>
├── routes/           <span>GPX + metadata, one per route</span>
├── waypoints/        <span>one GeoJSON file</span>
├── areas/            <span>one GeoJSON file</span>
├── photos/           <span>original files + metadata</span>
├── collections.json  <span>folders and lists</span>
├── errors.json       <span>anything that didn't export</span>
└── manifest.json`;

function home(): string {
	const manifesto = renderMarkdown(readFileSync(join(CONTENT_DIR, 'manifesto.md'), 'utf8'));
	return page({
		path: '/',
		title: "MapLiberator: keep a copy of everything you've mapped",
		description:
			'A free browser extension that saves your whole outdoor mapping account, photos and folders included, to one ZIP file on your computer.',
		bodyClass: 'home',
		body: `<main>
<section class="hero">
<div class="container hero-grid">
<div>
<h1>Keep a copy of everything you've mapped.</h1>
<p class="lede">MapLiberator is a free, open-source browser extension that saves your whole outdoor mapping
account to one ZIP file on your computer. That includes your tracks, routes, waypoints, areas and
photos, along with the folders you keep them in.</p>
${storeButtons()}
</div>
<figure class="tree" aria-label="What is inside an archive">
<pre>${ARCHIVE_TREE}</pre>
</figure>
</div>
</section>
<div class="container">
<article class="prose">
${manifesto.html}
</article>
<section class="callout">
<h2>For mapping app developers</h2>
<p>A Portable Map Archive is a ZIP of GPX, GeoJSON and JSON files. The specification is short and
open, and comes with JSON Schemas, a validator and a reference reader of about a hundred lines. If
your app can import one, people can bring everything they've made to it in one step.</p>
<a class="btn" href="/spec/">Read the specification</a>
</section>
</div>
</main>`
	});
}

function spec(specDir: string, schemas: Map<string, string>): string {
	const source = readFileSync(join(specDir, `portable-map-archive-${SPEC_VERSION}.md`), 'utf8');
	const rendered = renderMarkdown(source, specLink(schemas));
	const intro = renderMarkdown(readFileSync(join(CONTENT_DIR, 'spec-intro.md'), 'utf8'));
	const toc = rendered.toc
		.map(({ id, title }) => `<li><a href="#${id}">${title}</a></li>`)
		.join('');
	return page({
		path: '/spec/',
		title: `Portable Map Archive ${SPEC_VERSION}`,
		description:
			"The Portable Map Archive format: one person's map data from one platform, packaged so any other app can import it.",
		bodyClass: 'spec',
		body: `<div class="container spec-grid">
<nav class="toc" aria-label="Contents">
<p>Contents</p>
<ol>${toc}</ol>
<p class="toc-links"><a href="${REPO}/blob/main/spec/portable-map-archive-${SPEC_VERSION}.md">Markdown source</a></p>
</nav>
<main>
<aside class="preface">
${intro.html}
</aside>
<article class="prose">
${linkSections(rendered.html, rendered.ids)}
</article>
</main>
</div>`
	});
}

function license(specDir: string): string {
	const { html } = renderMarkdown(readFileSync(join(specDir, 'LICENSE.md'), 'utf8'));
	return page({
		path: '/spec/license/',
		title: 'License of the Portable Map Archive specification',
		description: 'The Portable Map Archive specification and schemas are licensed CC BY 4.0.',
		body: `<main class="container">
<article class="prose">
${html}
</article>
</main>`
	});
}

function notFound(): string {
	return page({
		path: '/404.html',
		title: 'Not found',
		description: 'This page does not exist.',
		body: `<main class="container">
<article class="prose">
<h1>Not found</h1>
<p>There is nothing at this address. Try the <a href="/">home page</a> or the
<a href="/spec/">specification</a>.</p>
</article>
</main>`
	});
}

/**
 * A checkout of the extension repository: EXTENSION_DIR if set, otherwise a shallow clone of main
 * into a temporary directory that `remove` deletes. `source` says which, for the build log.
 */
export function checkoutExtension(): { dir: string; source: string; remove: () => void } {
	const local = process.env.EXTENSION_DIR;
	if (local) return { dir: resolve(local), source: resolve(local), remove: () => {} };
	const dir = mkdtempSync(join(tmpdir(), 'mapliberator-extension-'));
	execFileSync('git', ['clone', '--quiet', '--depth=1', `${REPO}.git`, dir], { stdio: 'inherit' });
	const commit = execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], {
		encoding: 'utf8'
	}).trim();
	return {
		dir,
		source: `${REPO}@${commit}`,
		remove: () => rmSync(dir, { recursive: true, force: true })
	};
}

export function buildSite(extensionDir: string, outDir = join(ROOT, 'dist')): string {
	const specDir = join(extensionDir, 'spec');
	const write = (path: string, content: string | Buffer) => {
		mkdirSync(dirname(join(outDir, path)), { recursive: true });
		writeFileSync(join(outDir, path), content);
	};
	rmSync(outDir, { recursive: true, force: true });
	const schemas = schemaPaths(specDir);
	write('index.html', home());
	write('spec/index.html', spec(specDir, schemas));
	write('spec/license/index.html', license(specDir));
	write('404.html', notFound());
	for (const [name, path] of schemas) {
		write(path, readFileSync(join(specDir, 'schemas', name)));
	}
	copyFileSync(join(CONTENT_DIR, 'style.css'), join(outDir, 'style.css'));
	copyFileSync(join(extensionDir, 'public', 'icons', '128.png'), join(outDir, 'icon.png'));
	copyFileSync(join(extensionDir, 'public', 'icons', '32.png'), join(outDir, 'favicon.png'));
	return outDir;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const extension = checkoutExtension();
	try {
		console.log(`site built in ${buildSite(extension.dir)} from ${extension.source}`);
	} finally {
		extension.remove();
	}
}
