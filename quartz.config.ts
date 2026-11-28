import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration — Starling Murmuration Digital Garden
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "Starling Murmuration",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: false,
    analytics: null,
    locale: "en-US",
    baseUrl: "planckmaxxing.github.io/w-a",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: {
          name: "Inter",
          weights: [400, 500, 600],
          includeItalic: false,
        },
        body: {
          name: "Inter",
          weights: [400, 500, 600],
          includeItalic: true,
        },
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#ffffff",
          lightgray: "rgba(0, 0, 0, 0.12)",
          gray: "#6e6e73",
          darkgray: "#111111",
          dark: "#0a0a0b",
          secondary: "rgb(160, 70, 70)",
          tertiary: "#52525b",
          highlight: "rgba(0, 0, 0, 0.045)",
          textHighlight: "#fff23688",
        },
        darkMode: {
          light: "#1e1e1e",
          lightgray: "#333333",
          gray: "#999999",
          darkgray: "#dadada",
          dark: "#ededed",
          secondary: "rgb(160, 70, 70)",
          tertiary: "#b3b3b3",
          highlight: "rgba(255, 255, 255, 0.06)",
          textHighlight: "#b3aa0288",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest", externalLinkIcon: false }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
