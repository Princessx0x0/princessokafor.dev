import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const BLOG_DIR = './src/content/blog';
const VERA_DIR = './src/content/vera';
const OUTPUT = './public/content-index.json';

async function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;
    const meta = {};
    match[1].split('\n').forEach(line => {
        const [key, ...val] = line.split(':');
        if (key && val.length) meta[key.trim()] = val.join(':').trim().replace(/^["']|["']$/g, '');
    });
    return { meta, body: match[2].trim() };
}

async function getPostsFromDir(dir, urlPrefix) {
    const files = await readdir(dir);
    const posts = [];
    for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const content = await readFile(join(dir, file), 'utf-8');
        const parsed = await parseFrontmatter(content);
        if (!parsed) continue;
        const slug = file.replace('.md', '');
        posts.push({
            slug,
            url: `${urlPrefix}/${slug}`,
            title: parsed.meta.title || '',
            description: parsed.meta.description || '',
            date: parsed.meta.date || '',
            tags: parsed.meta.tags || '',
            body: parsed.body.slice(0, 2000) // first 2000 chars
        });
    }
    return posts;
}

const blog = await getPostsFromDir(BLOG_DIR, '/blog');
const vera = await getPostsFromDir(VERA_DIR, '/blog');

await writeFile(OUTPUT, JSON.stringify({ blog, vera }, null, 2));
console.log(`Exported ${blog.length} blog posts and ${vera.length} vera posts`);