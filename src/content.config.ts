// The Astro content collections of the site: the plugins, the activity feed and the vimdocs,
// each filled by a loader from src/loaders/repos.ts.

import { defineCollection } from 'astro:content';
import {
  activityLoader,
  commitSchema,
  pluginSchema,
  pluginsLoader,
  vimdocSchema,
  vimdocsLoader,
} from './loaders/repos';

export const collections = {
  plugins: defineCollection({ loader: pluginsLoader(), schema: pluginSchema }),
  activity: defineCollection({ loader: activityLoader(), schema: commitSchema }),
  vimdocs: defineCollection({ loader: vimdocsLoader(), schema: vimdocSchema }),
};
