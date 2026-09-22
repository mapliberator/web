/**
 * The website (build.ts) serves every mapliberator.com URL the extension repository hands out,
 * has no broken internal links, and loads nothing from anywhere else. Like the build, it clones
 * the extension unless EXTENSION_DIR points at a checkout.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildSite, checkoutExtension, SITE_ORIGIN } from '../build.ts';

const EXTENSION = checkoutExtension();
const ROOT = EXTENSION.dir;
const OUT = buildSite(ROOT, mkdtempSync(join(tmpdir(), 'mapliberator-site-')));
afterAll(() => {
	rmSync(OUT, { recursive: true, force: true });
	EXTENSION.remove();
});

function listFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? listFiles(path) : [path];
	});
}

/** The file a static host serves for a path: `/spec/` and `/spec` → spec/index.html. */
function served(path: string): string | undefined {
	const file = join(OUT, decodeURIComponent(path));
	return [file, join(file, 'index.html')].find((c) => existsSync(c) && statSync(c).isFile());
}

const pages = listFiles(OUT)
	.filter((file) => file.endsWith('.html'))
	.map((file) => ({ name: relative(OUT, file), html: readFileSync(file, 'utf8') }));

describe('site', () => {
	it('serves every mapliberator.com URL in the extension and the spec', () => {
		const paths = new Set<string>();
		for (const file of [...listFiles(join(ROOT, 'src')), ...listFiles(join(ROOT, 'spec'))]) {
			for (const [, path] of readFileSync(file, 'utf8').matchAll(
				/https:\/\/mapliberator\.com(\/[^\s"'`)<>]*)?/g
			)) {
				paths.add(path ?? '/');
			}
		}
		expect([...paths]).toContain('/spec/');
		for (const path of paths) expect(served(path), path).toBeDefined();
	});

	it('publishes each schema, byte for byte, at its $id', () => {
		const dir = join(ROOT, 'spec', 'schemas');
		for (const name of readdirSync(dir)) {
			const text = readFileSync(join(dir, name), 'utf8');
			const id = String((JSON.parse(text) as { $id: unknown }).$id);
			expect(id.startsWith(`${SITE_ORIGIN}/`), id).toBe(true);
			const file = served(new URL(id).pathname);
			expect(file, id).toBeDefined();
			expect(readFileSync(file ?? '', 'utf8')).toBe(text);
		}
	});

	it('renders every numbered section of the specification with an anchor', () => {
		const source = readFileSync(join(ROOT, 'spec', 'portable-map-archive-1.0-draft.md'), 'utf8');
		const numbers = [...source.matchAll(/^#{2,4} (\d+(?:\.\d+)*)\.? /gm)].map(([, n]) => n);
		expect(numbers.length).toBeGreaterThan(30);
		const spec = readFileSync(served('/spec/') ?? '', 'utf8');
		for (const number of numbers) expect(spec).toContain(`id="sec-${number}"`);
	});

	it.each(pages.map((page) => [page.name, page.html]))('%s has no broken links', (_, html) => {
		for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
			if (!target || /^(https?:|mailto:)/.test(target)) continue;
			const [path, fragment] = target.split('#');
			const file = path ? served(path) : undefined;
			if (path) expect(file, target).toBeDefined();
			if (fragment) {
				expect(file ? readFileSync(file, 'utf8') : html, target).toContain(`id="${fragment}"`);
			}
		}
	});

	it.each(pages.map((page) => [page.name, page.html]))(
		'%s runs no script and loads nothing from another origin',
		(_, html) => {
			expect(html).not.toMatch(/<script\b|<iframe\b|\son[a-z]+=/i);
			expect(html).not.toMatch(/\bsrc="(?!\/)/);
			for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
				if (!tag.includes('rel="canonical"')) expect(tag).toMatch(/href="\//);
			}
		}
	);
});
