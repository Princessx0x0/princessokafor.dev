import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
    schema: z.object({
        title: z.string(),
        date: z.coerce.string(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        draft: z.boolean().optional(),
    }),
});

const vera = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/vera' }),
    schema: z.object({
        title: z.string(),
        date: z.coerce.string(),
        description: z.string().optional(),
        order: z.number().optional(),
    }),
});

export const collections = { blog, vera };