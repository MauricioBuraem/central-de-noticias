// @ts-check
import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";

export default defineConfig({
  site: "https://centraldenoticias24h.com",
  output: "server",
  adapter: netlify({ imageCDN: true }),
  trailingSlash: "ignore",
  build: { inlineStylesheets: "always" },
  compressHTML: true,
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
});
