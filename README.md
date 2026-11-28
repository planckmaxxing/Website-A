# Starling Murmuration — Quartz Digital Garden

A minimalist split-screen digital garden powered by [Quartz v4](https://quartz.jzhao.xyz) (open-source Obsidian publisher), pairing a zero-lag 3D Starling Murmuration canvas with an editorial Markdown & KaTeX reader.

## Updating the Website

Push any `.md` file into `content/` (or edit existing files) on `main`, and GitHub Actions automatically rebuilds and deploys the site:

- **Home / About page**: edit `content/index.md`
- **Add a note to an existing folder**: push to `content/notes/My Note.md`, `content/essays/...`, or `content/archive/...`
- **Create a new folder**: push to `content/<folder>/My Note.md` — it appears automatically in the Explorer, Search, and Backlinks
- **Obsidian features supported**: `[[Wikilinks]]`, `[[Note|Display Alias]]`, `$inline math$`, `$$display math$$`, code blocks, lists, and YAML frontmatter (`title`, `order`, `tags`, `draft`)

## Local Preview

```bash
npm ci
npx quartz build --serve
```
