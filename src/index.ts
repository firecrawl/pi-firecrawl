import {
  defineTool,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  type CrawlOptions,
  Firecrawl,
  type MapOptions,
} from "@mendable/firecrawl-js";
import { Type } from "typebox";

const STATUS_KEY = "firecrawl";
const PACKAGE_NAME = "@firecrawl/pi-firecrawl";

interface FirecrawlSettings {
  apiUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const settings: FirecrawlSettings = {
  apiUrl: (
    process.env.FIRECRAWL_API_URL ??
    process.env.FIRECRAWL_BASE_URL ??
    "https://api.firecrawl.dev"
  )
    .trim()
    .replace(/\/+$/, ""),
  timeoutMs: parsePositiveInt(process.env.FIRECRAWL_TIMEOUT_MS),
  maxRetries: parsePositiveInt(process.env.FIRECRAWL_MAX_RETRIES),
};

let client: Firecrawl | undefined;

function getClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      `${PACKAGE_NAME}: FIRECRAWL_API_KEY is not set. Export it before running pi (get a key at https://www.firecrawl.dev).`
    );
  }
  if (!client) {
    client = new Firecrawl({
      apiKey,
      apiUrl: settings.apiUrl,
      timeoutMs: settings.timeoutMs,
      maxRetries: settings.maxRetries,
    });
  }
  return client;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: firecrawl_scrape
// ─────────────────────────────────────────────────────────────────────────────

const ScrapeParams = Type.Object({
  url: Type.String({ description: "URL to scrape." }),
  formats: Type.Optional(
    Type.Array(Type.Any(), {
      description:
        'Firecrawl v2 formats. Strings ("markdown", "html", "rawHtml", "links", "images", "screenshot", "summary", "changeTracking") or objects ({ type: "json", prompt, schema }, { type: "screenshot", fullPage }, { type: "changeTracking", modes: ["git-diff", "json"], tag }, etc.). "changeTracking" diffs against the previous scrape of the same URL and must be paired with "markdown". Defaults to ["markdown"].',
    })
  ),
  onlyMainContent: Type.Optional(
    Type.Boolean({
      description: "Return only the main page content. Default true.",
    })
  ),
  includeTags: Type.Optional(Type.Array(Type.String())),
  excludeTags: Type.Optional(Type.Array(Type.String())),
  waitFor: Type.Optional(
    Type.Number({ description: "Milliseconds to wait before scraping." })
  ),
  timeout: Type.Optional(
    Type.Number({ description: "Request timeout in milliseconds." })
  ),
  mobile: Type.Optional(
    Type.Boolean({ description: "Use a mobile viewport." })
  ),
  skipTlsVerification: Type.Optional(Type.Boolean()),
  removeBase64Images: Type.Optional(Type.Boolean()),
  blockAds: Type.Optional(Type.Boolean()),
  proxy: Type.Optional(
    Type.String({
      description:
        "Proxy mode: basic | stealth | enhanced | auto. Stealth costs more credits.",
    })
  ),
  maxAge: Type.Optional(
    Type.Number({
      description:
        "Serve from cache if a fresh copy exists in the last N milliseconds (cuts credit cost ~50%).",
    })
  ),
  headers: Type.Optional(Type.Record(Type.String(), Type.String())),
  actions: Type.Optional(
    Type.Array(Type.Any(), {
      description:
        "Browser actions to run before scraping (wait, click, write, screenshot, etc.).",
    })
  ),
  location: Type.Optional(
    Type.Any({ description: "Location options ({ country, languages })." })
  ),
  parsers: Type.Optional(
    Type.Array(Type.Any(), { description: "Parser overrides (e.g. PDF)." })
  ),
});

const scrapeTool = defineTool({
  name: "firecrawl_scrape",
  label: "Firecrawl: Scrape",
  description:
    "Scrape one URL and return clean LLM-ready content (markdown, HTML, links, screenshots, or structured JSON). Handles JavaScript rendering, bot blocks, and PDFs.",
  promptSnippet: "Scrape a URL into markdown / JSON via Firecrawl.",
  promptGuidelines: [
    "Prefer firecrawl_scrape over built-in fetch tools for any HTTP(S) URL: it returns clean markdown, handles JS rendering, and bypasses common blocks.",
    'Default formats to ["markdown"] unless the caller needs HTML, links, screenshots, or structured JSON via { type: "json", schema }.',
    'To detect whether a page changed since the last scrape, pass formats: ["markdown", "changeTracking"]; the result includes changeTracking.changeStatus (new | same | changed | removed).',
    "If FIRECRAWL_API_KEY is missing, surface the configuration error instead of retrying.",
  ],
  parameters: ScrapeParams,
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 scrape", async () => {
      const { url, ...options } = params;
      const fc = getClient();
      const result = await runWithAbort(signal, () =>
        fc.scrape(url, cleanObject(options))
      );
      return jsonResult(result);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: firecrawl_search
// ─────────────────────────────────────────────────────────────────────────────

const SearchParams = Type.Object({
  query: Type.String({ description: "Search query." }),
  limit: Type.Optional(
    Type.Number({ description: "Maximum number of results." })
  ),
  sources: Type.Optional(
    Type.Array(Type.Any(), {
      description: "Sources: web | news | images, or objects.",
    })
  ),
  categories: Type.Optional(
    Type.Array(Type.Any(), {
      description: "Categories: github | research | pdf, or objects.",
    })
  ),
  includeDomains: Type.Optional(Type.Array(Type.String())),
  excludeDomains: Type.Optional(Type.Array(Type.String())),
  tbs: Type.Optional(
    Type.String({ description: "Google-style time-based filter." })
  ),
  location: Type.Optional(Type.String()),
  timeout: Type.Optional(Type.Number()),
  scrapeOptions: Type.Optional(
    Type.Any({
      description: "Apply Firecrawl scrape options to each result page.",
    })
  ),
});

const searchTool = defineTool({
  name: "firecrawl_search",
  label: "Firecrawl: Search",
  description:
    "Search the web through Firecrawl (web, news, images) and optionally scrape each result. Use this for any web research, fact-checking, news, or finding URLs.",
  promptSnippet: "Search the web via Firecrawl.",
  promptGuidelines: [
    "Use firecrawl_search for any web search, news lookup, or competitive research instead of built-in browse tools.",
    'Pass scrapeOptions: { formats: ["markdown"] } when you want the result pages fetched in one round-trip.',
  ],
  parameters: SearchParams,
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 search", async () => {
      const { query, ...req } = params;
      const fc = getClient();
      const result = await runWithAbort(signal, () =>
        fc.search(query, cleanObject(req))
      );
      return jsonResult(result);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: firecrawl_map
// ─────────────────────────────────────────────────────────────────────────────

const MapParams = Type.Object({
  url: Type.String({ description: "Website URL to map." }),
  search: Type.Optional(
    Type.String({ description: "Filter discovered URLs by term." })
  ),
  sitemap: Type.Optional(
    Type.String({
      description: "Sitemap mode: only | include | skip. Default include.",
    })
  ),
  includeSubdomains: Type.Optional(Type.Boolean()),
  ignoreQueryParameters: Type.Optional(Type.Boolean()),
  limit: Type.Optional(
    Type.Number({ description: "Maximum number of URLs to return." })
  ),
  timeout: Type.Optional(Type.Number()),
  location: Type.Optional(Type.Any()),
});

const mapTool = defineTool({
  name: "firecrawl_map",
  label: "Firecrawl: Map",
  description:
    "Discover URLs for a site quickly (sitemap-aware). Use before crawling to scope the work, or to find specific pages by keyword.",
  promptSnippet: "Map a site to discover its URLs via Firecrawl.",
  parameters: MapParams,
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 map", async () => {
      const { url, ...options } = params;
      const fc = getClient();
      const result = await runWithAbort(signal, () =>
        fc.map(url, cleanObject(options) as MapOptions)
      );
      return jsonResult(result);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: firecrawl_crawl  (starts an async job)
// ─────────────────────────────────────────────────────────────────────────────

const CrawlParams = Type.Object({
  url: Type.String({ description: "Starting URL for the crawl." }),
  prompt: Type.Optional(
    Type.String({
      description: "Natural-language hint for crawl scope (server normalizes).",
    })
  ),
  limit: Type.Optional(Type.Number({ description: "Maximum pages to crawl." })),
  maxDiscoveryDepth: Type.Optional(Type.Number()),
  includePaths: Type.Optional(Type.Array(Type.String())),
  excludePaths: Type.Optional(Type.Array(Type.String())),
  sitemap: Type.Optional(Type.String({ description: "skip | include | only" })),
  ignoreQueryParameters: Type.Optional(Type.Boolean()),
  deduplicateSimilarURLs: Type.Optional(Type.Boolean()),
  allowExternalLinks: Type.Optional(Type.Boolean()),
  allowSubdomains: Type.Optional(Type.Boolean()),
  crawlEntireDomain: Type.Optional(Type.Boolean()),
  ignoreRobotsTxt: Type.Optional(Type.Boolean()),
  delay: Type.Optional(
    Type.Number({ description: "Delay between requests in seconds." })
  ),
  maxConcurrency: Type.Optional(Type.Number()),
  scrapeOptions: Type.Optional(Type.Any()),
  webhook: Type.Optional(Type.Any()),
});

const crawlTool = defineTool({
  name: "firecrawl_crawl",
  label: "Firecrawl: Crawl (start)",
  description:
    "Start an asynchronous crawl job and return its id and status URL. Use firecrawl_crawl_status to poll for results.",
  promptSnippet: "Start a Firecrawl site crawl job.",
  promptGuidelines: [
    "firecrawl_crawl is async. Always follow up with firecrawl_crawl_status (or firecrawl_crawl_cancel).",
    "For one-off scrapes prefer firecrawl_scrape; for discovery prefer firecrawl_map; reach for crawl when you need many pages from one site.",
  ],
  parameters: CrawlParams,
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 crawl", async () => {
      const { url, ...options } = params;
      const fc = getClient();
      const result = await runWithAbort(signal, () =>
        fc.startCrawl(url, cleanObject(options) as CrawlOptions)
      );
      return jsonResult(result);
    });
  },
});

const crawlStatusTool = defineTool({
  name: "firecrawl_crawl_status",
  label: "Firecrawl: Crawl Status",
  description:
    "Check the status of a crawl job and retrieve completed pages. Returns { status, completed, total, data, next? }.",
  promptSnippet: "Check the status of a Firecrawl crawl job.",
  parameters: Type.Object({
    id: Type.String({
      description: "Crawl job id returned by firecrawl_crawl.",
    }),
    limit: Type.Optional(Type.Number({ description: "Pagination limit." })),
    skip: Type.Optional(
      Type.Number({ description: "Pagination skip offset." })
    ),
    autoPaginate: Type.Optional(
      Type.Boolean({
        description: "Auto-paginate to completion. Default false.",
      })
    ),
  }),
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 crawl status", async () => {
      const fc = getClient();
      const pagination =
        params.limit === undefined &&
        params.skip === undefined &&
        params.autoPaginate === undefined
          ? undefined
          : cleanObject({
              limit: params.limit,
              skip: params.skip,
              autoPaginate: params.autoPaginate,
            });
      const result = await runWithAbort(signal, () =>
        fc.getCrawlStatus(params.id, pagination)
      );
      return jsonResult(result);
    });
  },
});

const crawlCancelTool = defineTool({
  name: "firecrawl_crawl_cancel",
  label: "Firecrawl: Crawl Cancel",
  description: "Cancel an in-progress crawl job.",
  promptSnippet: "Cancel a Firecrawl crawl job.",
  parameters: Type.Object({
    id: Type.String({ description: "Crawl job id to cancel." }),
  }),
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 crawl cancel", async () => {
      const fc = getClient();
      const ok = await runWithAbort(signal, () => fc.cancelCrawl(params.id));
      return jsonResult({ cancelled: ok, id: params.id });
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: firecrawl_batch_scrape  (starts an async job)
// ─────────────────────────────────────────────────────────────────────────────

const batchScrapeTool = defineTool({
  name: "firecrawl_batch_scrape",
  label: "Firecrawl: Batch Scrape (start)",
  description:
    "Scrape many URLs in one async job. Returns job id and status URL. Use firecrawl_batch_scrape_status to poll for completion.",
  promptSnippet: "Start a Firecrawl batch scrape across multiple URLs.",
  parameters: Type.Object({
    urls: Type.Array(Type.String(), { description: "List of URLs to scrape." }),
    options: Type.Optional(
      Type.Any({
        description:
          "Scrape options applied to every URL (same shape as firecrawl_scrape).",
      })
    ),
    maxConcurrency: Type.Optional(Type.Number()),
    ignoreInvalidURLs: Type.Optional(Type.Boolean()),
    webhook: Type.Optional(Type.Any()),
    idempotencyKey: Type.Optional(Type.String()),
  }),
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 batch scrape", async () => {
      const { urls, ...opts } = params;
      const fc = getClient();
      const result = await runWithAbort(signal, () =>
        fc.startBatchScrape(urls, cleanObject(opts))
      );
      return jsonResult(result);
    });
  },
});

const batchScrapeStatusTool = defineTool({
  name: "firecrawl_batch_scrape_status",
  label: "Firecrawl: Batch Scrape Status",
  description:
    "Check the status of a batch scrape job and retrieve completed documents.",
  promptSnippet: "Check the status of a Firecrawl batch scrape job.",
  parameters: Type.Object({
    id: Type.String({ description: "Batch scrape job id." }),
    limit: Type.Optional(Type.Number()),
    skip: Type.Optional(Type.Number()),
    autoPaginate: Type.Optional(Type.Boolean()),
  }),
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 batch status", async () => {
      const fc = getClient();
      const pagination =
        params.limit === undefined &&
        params.skip === undefined &&
        params.autoPaginate === undefined
          ? undefined
          : cleanObject({
              limit: params.limit,
              skip: params.skip,
              autoPaginate: params.autoPaginate,
            });
      const result = await runWithAbort(signal, () =>
        fc.getBatchScrapeStatus(params.id, pagination)
      );
      return jsonResult(result);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: firecrawl_extract
// ─────────────────────────────────────────────────────────────────────────────

const extractTool = defineTool({
  name: "firecrawl_extract",
  label: "Firecrawl: Extract",
  description:
    "Run a Firecrawl extract job: pass URLs plus a prompt (and optional JSON schema) to pull structured data across pages. Prefer firecrawl_scrape with a JSON format for single pages.",
  promptSnippet: "Extract structured data from URLs via Firecrawl.",
  promptGuidelines: [
    'Prefer firecrawl_scrape with formats: [{ type: "json", prompt, schema }] for single-URL extraction.',
    "Use firecrawl_extract for multi-URL structured extraction with a shared schema.",
  ],
  parameters: Type.Object({
    urls: Type.Optional(Type.Array(Type.String())),
    prompt: Type.Optional(Type.String()),
    schema: Type.Optional(
      Type.Any({ description: "JSON Schema describing the desired output." })
    ),
    systemPrompt: Type.Optional(Type.String()),
    allowExternalLinks: Type.Optional(Type.Boolean()),
    enableWebSearch: Type.Optional(Type.Boolean()),
    showSources: Type.Optional(Type.Boolean()),
    scrapeOptions: Type.Optional(Type.Any()),
    pollInterval: Type.Optional(Type.Number()),
    timeout: Type.Optional(
      Type.Number({ description: "Waiter timeout in seconds." })
    ),
  }),
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 extract", async () => {
      const fc = getClient();
      const result = await runWithAbort(signal, () =>
        fc.extract(cleanObject(params))
      );
      return jsonResult(result);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: firecrawl_interact  (live browser session on a scraped page)
// ─────────────────────────────────────────────────────────────────────────────

const interactTool = defineTool({
  name: "firecrawl_interact",
  label: "Firecrawl: Interact",
  description:
    "Control a live browser session on a scraped page with a natural-language prompt or code (click, type, navigate, extract). Pass a url to scrape and start a session, or a scrapeId to continue one. Returns the output plus the scrapeId to reuse. Call firecrawl_interact_stop when finished.",
  promptSnippet: "Interact with a live page in a Firecrawl browser session.",
  promptGuidelines: [
    "Use firecrawl_interact when a page needs clicks, form input, logins, or multi-step navigation that firecrawl_scrape cannot do in one call.",
    "The first call takes a url; later calls pass the returned scrapeId to keep working in the same session.",
    "Always call firecrawl_interact_stop with the scrapeId when done so the session is released.",
  ],
  parameters: Type.Object({
    url: Type.Optional(
      Type.String({
        description:
          "URL to scrape to start a new session. Required when scrapeId is not given.",
      })
    ),
    scrapeId: Type.Optional(
      Type.String({
        description:
          "Scrape id of an existing session (from a previous firecrawl_interact call or a scrape's metadata.scrapeId).",
      })
    ),
    prompt: Type.Optional(
      Type.String({
        description:
          "Natural-language instruction for the browser agent. Provide prompt or code.",
      })
    ),
    code: Type.Optional(
      Type.String({
        description:
          "Code to execute in the browser session. Provide prompt or code.",
      })
    ),
    language: Type.Optional(
      Type.Union(
        [Type.Literal("python"), Type.Literal("node"), Type.Literal("bash")],
        { description: "Language of code. Default node." }
      )
    ),
    timeout: Type.Optional(
      Type.Number({
        description: "Execution timeout in seconds (1-300). Default 30.",
      })
    ),
  }),
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 interact", async () => {
      const { url, scrapeId: existingScrapeId, ...args } = params;
      const fc = getClient();
      const scrapeId =
        existingScrapeId ??
        (
          await runWithAbort(signal, () => {
            if (!url) {
              throw new Error("firecrawl_interact needs a url or a scrapeId.");
            }
            return fc.scrape(url);
          })
        ).metadata?.scrapeId;
      if (!scrapeId) {
        throw new Error("Scrape did not return a scrapeId to interact with.");
      }
      const result = await runWithAbort(signal, () =>
        fc.interact(scrapeId, cleanObject(args))
      );
      return jsonResult({ scrapeId, ...result });
    });
  },
});

const interactStopTool = defineTool({
  name: "firecrawl_interact_stop",
  label: "Firecrawl: Interact Stop",
  description: "Stop the browser session started by firecrawl_interact.",
  promptSnippet: "Stop a Firecrawl interact session.",
  parameters: Type.Object({
    scrapeId: Type.String({
      description: "Scrape id returned by firecrawl_interact.",
    }),
  }),
  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    return withStatus(ctx, "🔥 interact stop", async () => {
      const fc = getClient();
      const result = await runWithAbort(signal, () =>
        fc.stopInteraction(params.scrapeId)
      );
      return jsonResult(result);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Extension entry point
// ─────────────────────────────────────────────────────────────────────────────

export default function firecrawl(pi: ExtensionAPI) {
  pi.registerTool(scrapeTool);
  pi.registerTool(searchTool);
  pi.registerTool(mapTool);
  pi.registerTool(crawlTool);
  pi.registerTool(crawlStatusTool);
  pi.registerTool(crawlCancelTool);
  pi.registerTool(batchScrapeTool);
  pi.registerTool(batchScrapeStatusTool);
  pi.registerTool(extractTool);
  pi.registerTool(interactTool);
  pi.registerTool(interactStopTool);

  pi.registerCommand("firecrawl", {
    description: "Show Firecrawl extension configuration status.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(buildStatusMessage(), hasApiKey() ? "info" : "warning");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface StatusContext {
  ui: ExtensionContext["ui"];
}

async function withStatus<T>(
  ctx: StatusContext,
  status: string,
  callback: () => Promise<T>
) {
  ctx.ui.setStatus(STATUS_KEY, status);
  try {
    return await callback();
  } finally {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }
}

async function runWithAbort<T>(
  signal: AbortSignal | undefined,
  work: () => Promise<T>
): Promise<T> {
  if (!signal) return work();
  if (signal.aborted) throw new Error("Aborted before request started.");
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("Aborted by user."));
    signal.addEventListener("abort", onAbort, { once: true });
    work().then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

function jsonResult(payload: unknown) {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    details: payload,
  };
}

function hasApiKey(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim());
}

function buildStatusMessage(): string {
  const apiUrl = settings.apiUrl;
  if (!hasApiKey()) {
    return `${PACKAGE_NAME}: FIRECRAWL_API_KEY is not set. Configured API URL: ${apiUrl}. Get a key at https://www.firecrawl.dev.`;
  }
  return `${PACKAGE_NAME}: ready. API URL ${apiUrl}, API key present.`;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function cleanObject<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cleanObject(item)) as unknown as T;
  }
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .map(
      ([entryKey, entryValue]) => [entryKey, cleanObject(entryValue)] as const
    );
  return Object.fromEntries(entries) as T;
}
