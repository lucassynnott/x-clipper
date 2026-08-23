# X Clipper

Save X (Twitter) posts with images and videos included.

English README → [README.md](README.md)

![](./assets/post_page.png)

## Features

- **Clip posts and Articles** from X (Twitter) by pasting the URL
- **Save complete Article text** as Markdown, including headings, lists, quotes, links, and inline formatting
- **Download images and videos** directly into your vault's attachments folder
- **Auto-extract hashtags** from post text and save them as tags (both frontmatter and inline)
- **Tag suggestions** with toggle buttons based on your usage history
- **Previous tags remembered** — manually selected tags from your last save are pre-activated
- **Clear all** button to quickly reset tag selections
- **Custom X icon** in the ribbon for quick access
- **Japanese language support** for filenames and tags
- **Fallback API** — automatically tries vxtwitter if fxtwitter is unavailable

## Installation

### From Community Plugins (Recommended)

1. Open **Settings → Community plugins**
2. Click **Browse** and search for "X Clipper"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/RyotaUnzai/x-clipper/releases)
2. Create a folder `.obsidian/plugins/x-clipper/` in your vault
3. Copy the downloaded files into that folder
4. Restart Obsidian and enable the plugin in **Settings → Community plugins**

## Usage

![](./assets/clip_post_dialog.png)

1. Click the **𝕏 icon** in the ribbon, or run the **Clip Post** command from the command palette
2. Paste the post URL (e.g. `https://x.com/username/status/123456789`)
3. Optionally add or toggle tags
4. Click **Clip Post**

The plugin will:
- Fetch the post text and author info
- Download any attached images/videos to `{Posts folder}/attachments/`
- Create a Markdown note with frontmatter, embedded media, and tags

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Posts folder | Where to save clipped posts | `X_Posts` |
| Copy note path to clipboard | Auto-copy `[[note]]` link after saving | On |
| Open saved note after saving | Open the note immediately | Off |

## Saved Note Format

```markdown
---
author: "Author Name"
author_url: "https://x.com/username"
post_url: "https://x.com/username/status/123"
date_saved: 2025-01-01T12:00:00.000Z
tags: ["houdini", "3dcg", "VFX"]
---
# Post by Author Name
Post text content here...

![[post_img_1234567890_1.jpg]]

---
#houdini #3dcg #VFX

**Author:** [Author Name](https://x.com/username)
**Original Post:** [View on X](https://x.com/username/status/123)
**Saved:** 2025年1月1日 12:00
```

## API

This plugin uses the [fxtwitter](https://github.com/FixTweet/FixTweet) API (with [vxtwitter](https://github.com/dylanpdx/BetterTwitFix) as fallback) to fetch post data. No authentication or API keys are required.

