import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Content model for dhosae.
 * Deliberately flat: no public categories, no tags surfaced to readers.
 * The topic is never advertised — that's the whole point. `desk` is kept
 * only as an optional private note for me; it is never rendered.
 * This same schema is what the in-browser studio (next phase) will use.
 */
const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      dek: z.string(), // standfirst — shown on hover only
      author: z.string().default("dhosae"),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),
      readingMinutes: z.number().optional(),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
      cover: image().optional(),
      desk: z.string().optional(), // private, never rendered
      tags: z.array(z.string()).default([]), // private, never rendered
    }),
});

export const collections = { posts };
