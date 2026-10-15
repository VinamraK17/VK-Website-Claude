# Insights — publishing a newsletter issue

Each issue is one Markdown file in `content/insights/`. The site serves:

| URL | What it is |
|---|---|
| `/insights` | Archive of all published issues, newest first |
| `/insights/<slug>` | One issue |
| `/insights/feed.xml` | RSS feed |
| `/sitemap.xml` | Static sitemap plus every published issue |

## Publish an issue

1. Copy `content/insights/_TEMPLATE.md` to a new file named after the issue, e.g. `content/insights/design-the-handoff.md`. The file name (without `.md`) becomes the URL: lowercase letters, digits and hyphens only.
2. Fill in the front matter:
   - `title` — required
   - `date` — required, `YYYY-MM-DD`. **The issue stays hidden until this date in Zurich**, so you can deploy it days early and it goes live on its own.
   - `summary` — one or two sentences for the archive, search results and link previews
   - `linkedin` — leave empty at first; add the LinkedIn Newsletter URL once that edition is out, then redeploy
   - `published` — set to `false` to keep a finished file off the site
3. Push to `main`, then pull + rebuild + restart the stack in Dockhand.
4. Open `https://vinamrakumar.com/insights/<slug>` on the publication date and check it renders.
5. Email it: `/admin` → **Newsletter** → select the issue → **Send test to me**, read it, then type `SEND` → **Send to subscribers**. See `NEWSLETTER_SETUP.md`.

Files whose name starts with `_` are never published.

## Republishing on LinkedIn (two days later)

Publish the same text as a LinkedIn Newsletter edition and end it with:

> Originally published at vinamrakumar.com/insights/<slug>

Then put that edition's URL in the issue's `linkedin:` field and redeploy, so the site links to the discussion.

## Before every issue

- No Sunrise names, links, internal projects or metrics.
- No vendor names or links.
- Every `[Vin: …]` gap filled with a real detail; none left in the text.
- Every figure checked on its source page.
