// Random-mode content. The catalog JSON is the editable source (content workstream);
// items with an `emoji` and no `imageUrl` get a generated placeholder card.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContentCategory } from '@gmr/shared';

export interface CatalogItem {
  slug: string;
  title: string;
  emoji?: string;
  imageUrl?: string;
  fact?: string;
  sourceUrl?: string;
  license?: string;
  credit?: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  emoji: string;
  colors: [string, string];
  items: CatalogItem[];
}

const SLUG = /^[a-z0-9-]+$/;
const PLACEHOLDER_LICENSE = 'CC0-1.0 (generated placeholder card)';

export async function readCatalog(contentDir: string): Promise<CatalogCategory[]> {
  const raw = await readFile(path.join(contentDir, 'categories.json'), 'utf8');
  const data = JSON.parse(raw) as CatalogCategory[];
  for (const cat of data) {
    if (!SLUG.test(cat.id)) throw new Error(`Invalid category id: ${cat.id}`);
    const slugs = new Set<string>();
    for (const item of cat.items) {
      if (!SLUG.test(item.slug) || slugs.has(item.slug)) throw new Error(`Invalid or duplicate slug: ${cat.id}/${item.slug}`);
      if (!item.imageUrl && !item.emoji) throw new Error(`Item needs imageUrl or emoji: ${cat.id}/${item.slug}`);
      slugs.add(item.slug);
    }
  }
  return data;
}

export const cardFileName = (categoryId: string, slug: string) => `${categoryId}-${slug}.svg`;

export function catalogToContent(catalog: CatalogCategory[]): ContentCategory[] {
  return catalog.map((cat) => ({
    id: cat.id,
    name: cat.name,
    emoji: cat.emoji,
    items: cat.items.map((item) => ({
      id: `${cat.id}-${item.slug}`,
      categoryId: cat.id,
      imageUrl: item.imageUrl ?? `/content/cards/${cardFileName(cat.id, item.slug)}`,
      title: item.title,
      fact: item.fact ?? null,
      sourceUrl: item.sourceUrl ?? null,
      license: item.license ?? (item.imageUrl ? null : PLACEHOLDER_LICENSE),
      credit: item.credit ?? (item.imageUrl ? null : 'Guess My Rank'),
    })),
  }));
}

export function cardSvg(emoji: string, colors: [string, string], index: number): string {
  const angle = (index * 47) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0" stop-color="${colors[0]}"/>
      <stop offset="1" stop-color="${colors[1]}"/>
    </linearGradient>
  </defs>
  <rect width="480" height="480" fill="url(#g)"/>
  <circle cx="${120 + ((index * 61) % 240)}" cy="${90 + ((index * 37) % 120)}" r="150" fill="#ffffff" fill-opacity="0.12"/>
  <text x="240" y="262" font-size="230" text-anchor="middle" dominant-baseline="middle"
    font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${emoji}</text>
</svg>
`;
}

/** Writes missing placeholder cards; returns how many were written. */
export async function writeCards(cardsDir: string, catalog: CatalogCategory[], overwrite = false): Promise<number> {
  await mkdir(cardsDir, { recursive: true });
  let written = 0;
  for (const cat of catalog) {
    for (const [index, item] of cat.items.entries()) {
      if (item.imageUrl || !item.emoji) continue;
      const file = path.join(cardsDir, cardFileName(cat.id, item.slug));
      if (!overwrite && existsSync(file)) continue;
      await writeFile(file, cardSvg(item.emoji, cat.colors, index), 'utf8');
      written++;
    }
  }
  return written;
}
