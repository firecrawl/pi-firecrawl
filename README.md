# 🔥 pi-firecrawl — Official Firecrawl extension for the Pi coding agent

[![npm](https://img.shields.io/npm/v/@firecrawl/pi-firecrawl)](https://www.npmjs.com/package/@firecrawl/pi-firecrawl) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@firecrawl/pi-firecrawl` is the **official** [Pi coding agent](https://pi.dev) extension from [Firecrawl](https://www.firecrawl.dev). It gives your agent native tools for scraping, crawling, mapping, searching, batch scraping, and structured extraction — all backed by the maintained [`@mendable/firecrawl-js`](https://www.npmjs.com/package/@mendable/firecrawl-js) SDK, so new endpoints land here without re-implementing the API by hand.

## ✨ Features

- 🪄 **Drop-in replacement** for built-in fetch/browse tools. Returns clean LLM-ready markdown by default.
- 🌐 **Web search** (web, news, images) with optional inline scraping.
- 🗺️ **Site mapping** to discover URLs before crawling.
- 🕷️ **Async crawl jobs** with status, cancel, and pagination.
- 📚 **Batch scrape** across many URLs in a single job.
- 🧩 **Structured extraction** via JSON Schema.
- 🖱️ **Interact sessions** to click, type, and navigate a live page with a prompt or code.
- 🔄 **Change tracking** on scrapes to detect whether a page changed since the last visit.
- 🔒 Never logs or displays your API key.
- ⚡ Powered by the SDK — supports JS rendering, anti-bot bypass, PDFs, screenshots, actions, and proxy modes.

## 📦 Install

```bash
pi install npm:@firecrawl/pi-firecrawl
```

Try without installing permanently:

```bash
FIRECRAWL_API_KEY=fc-... pi -e npm:@firecrawl/pi-firecrawl
```

Try locally from a checkout:

```bash
FIRECRAWL_API_KEY=fc-... pi -e ./
```

## ⚙️ Configuration

Set a Firecrawl API key before starting Pi (get one at [firecrawl.dev](https://www.firecrawl.dev)):

```bash
export FIRECRAWL_API_KEY=fc-your-key
```

Optional overrides:

| Variable                | Default                     | Purpose                                                                        |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `FIRECRAWL_API_URL`     | `https://api.firecrawl.dev` | Custom API endpoint (self-hosted / proxy). `FIRECRAWL_BASE_URL` also accepted. |
| `FIRECRAWL_TIMEOUT_MS`  | _(SDK default)_             | Per-request timeout in milliseconds.                                           |
| `FIRECRAWL_MAX_RETRIES` | _(SDK default)_             | Automatic retry budget for transient failures.                                 |

The extension never logs or displays the API key.

## 🛠️ Pi tools

| Tool                            | What it does                                                                |
| ------------------------------- | --------------------------------------------------------------------------- |
| `firecrawl_scrape`              | Scrape one URL into markdown, HTML, links, screenshots, or structured JSON. |
| `firecrawl_search`              | Search the web (web, news, images) and optionally scrape each result.       |
| `firecrawl_map`                 | Discover URLs for a site quickly (sitemap-aware).                           |
| `firecrawl_crawl`               | Start an async site crawl job.                                              |
| `firecrawl_crawl_status`        | Poll a crawl job, with pagination.                                          |
| `firecrawl_crawl_cancel`        | Cancel a running crawl job.                                                 |
| `firecrawl_batch_scrape`        | Start an async job scraping many URLs at once.                              |
| `firecrawl_batch_scrape_status` | Poll a batch scrape job.                                                    |
| `firecrawl_extract`             | Multi-URL structured extraction with a shared schema or prompt.             |
| `firecrawl_interact`            | Control a live browser session on a page with a prompt or code.             |
| `firecrawl_interact_stop`       | Stop an interact session.                                                   |

All tools fail with a clear configuration error when `FIRECRAWL_API_KEY` is missing.

## 💬 Command

```text
/firecrawl
```

Reports whether the extension sees an API key and which API URL it will call.

## 🚀 Examples

Scrape a page as markdown:

```json
{
  "url": "https://www.firecrawl.dev/blog",
  "formats": ["markdown"]
}
```

Search the web with inline scraping:

```json
{
  "query": "Pi coding agent extensions",
  "limit": 5,
  "scrapeOptions": { "formats": ["markdown"] }
}
```

Map a site:

```json
{
  "url": "https://docs.firecrawl.dev",
  "limit": 50
}
```

Start a crawl with markdown extraction:

```json
{
  "url": "https://docs.firecrawl.dev",
  "limit": 25,
  "scrapeOptions": { "formats": ["markdown"] }
}
```

Structured extraction from a single page (preferred over `firecrawl_extract` for single URLs):

```json
{
  "url": "https://news.ycombinator.com",
  "formats": [
    {
      "type": "json",
      "prompt": "Extract the top 5 stories",
      "schema": {
        "type": "object",
        "properties": {
          "stories": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "title": { "type": "string" },
                "url": { "type": "string" },
                "points": { "type": "number" }
              }
            }
          }
        }
      }
    }
  ]
}
```

Detect changes since the last scrape (`changeTracking` needs `markdown` alongside it):

```json
{
  "url": "https://www.firecrawl.dev/pricing",
  "formats": ["markdown", "changeTracking"]
}
```

The result includes `changeTracking.changeStatus` (`new`, `same`, `changed`, or `removed`).

Interact with a page (first call scrapes the URL and opens a session; the result includes a `scrapeId`):

```json
{
  "url": "https://example.com",
  "prompt": "What is the page title?"
}
```

Continue in the same session, then stop it when done:

```json
{ "scrapeId": "<scrapeId from the previous call>", "prompt": "Click the first link" }
```

```json
{ "scrapeId": "<scrapeId>" }
```

The last call is `firecrawl_interact_stop`.

## 🧠 Use cases

- Pull docs into your context for grounded code generation.
- Audit competitor pricing or feature pages.
- Crawl a site before migration or content review.
- Search + scrape in a single agent loop for research tasks.
- Structured extraction from product catalogs, listings, or filings.

## 🗂️ Package layout

```txt
pi-firecrawl/
├── src/
│   └── index.ts
├── README.md
├── LICENSE
├── biome.json
├── tsconfig.json
└── package.json
```

The extension ships as TypeScript source. Pi loads it via [jiti](https://github.com/unjs/jiti) — no build step required.

## 🔗 Related

- [Firecrawl](https://www.firecrawl.dev) — the web data API powering this extension.
- [`@mendable/firecrawl-js`](https://www.npmjs.com/package/@mendable/firecrawl-js) — official JavaScript / TypeScript SDK.
- [Pi coding agent](https://pi.dev) — the agent runtime that loads this extension.
- [Firecrawl on GitHub](https://github.com/firecrawl/firecrawl) — open-source engine.

## 🤝 Contributing

Issues and PRs welcome at [github.com/firecrawl/pi-firecrawl](https://github.com/firecrawl/pi-firecrawl). Run `npm run check` before opening a PR.

## 📄 License

MIT. See [`LICENSE`](./LICENSE).
