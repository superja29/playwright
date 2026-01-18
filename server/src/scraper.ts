import { chromium } from 'playwright';

export type CheckResult = {
  price_value: number | null;
  price_text: string | null;
  in_stock: boolean | null;
  status: 'OK' | 'FAILED' | 'BLOCKED';
  error_message: string | null;
  raw_excerpt: string | null;
  response_time_ms: number;
};

function getProxy(): { server: string; username?: string; password?: string } | undefined {
  const server = process.env.PLAYWRIGHT_PROXY_SERVER;
  if (!server) return undefined;
  const username = process.env.PLAYWRIGHT_PROXY_USERNAME;
  const password = process.env.PLAYWRIGHT_PROXY_PASSWORD;
  return { server, username, password };
}

async function createPage(targetUrl: string) {
  const proxy = getProxy();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    proxy
  });
  const context = await browser.newContext({
    userAgent:
      process.env.PLAYWRIGHT_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    viewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept-Language': 'es-CL,es;q=0.9',
      'Upgrade-Insecure-Requests': '1',
      'Referer': new URL(targetUrl).origin
    }
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return { browser, context, page };
}
export async function detectSelector(url: string): Promise<{ selector: string | null; price: number | null; strategy: string | null }> {
  let browser: any = null;
  let context: any = null;
  let page: any = null;

  try {
    console.log(`[detectSelector] Starting detection for URL: ${url}`);
    ({ browser, context, page } = await createPage(url));
    console.log(`[detectSelector] Browser created, navigating to URL...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    console.log(`[detectSelector] Page loaded, waiting for network idle...`);
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      console.log(`[detectSelector] Network idle timeout (non-critical): ${(e as Error).message}`);
    }

    const strategies = [
      { name: 'VTEX Standard', selector: '.vtex-product-price-1-x-sellingPriceValue' },
      { name: 'VTEX Container', selector: '.vtex-product-price-1-x-sellingPrice' },
      { name: 'Electrolux Custom', selector: '.electrolux-product-prices-4-x-sellingPriceValue' },
      { name: 'Electrolux Container', selector: '.electrolux-product-prices-4-x-sellingPrice' },
      { name: 'MercadoLibre', selector: '.ui-pdp-price__second-line .andes-money-amount__fraction' },
      { name: 'MercadoLibre Fraction', selector: '.andes-money-amount__fraction' },
      { name: 'Ripley', selector: '.product-price' },
      { name: 'Linio', selector: '.price-main-md' },
      { name: 'Schema.org', selector: '[itemprop="price"]' },
      { name: 'OpenGraph', selector: 'meta[property="product:price:amount"]', isMeta: true },
      { name: 'OpenGraph Price', selector: 'meta[property="og:price:amount"]', isMeta: true },
      { name: 'Schema.org Meta', selector: 'meta[itemprop="price"]', isMeta: true },
      { name: 'Generic ID', selector: '#price' },
      { name: 'Generic Class', selector: '.price' },
      { name: 'Generic Product Price', selector: '.product-price' }
    ];

    console.log(`[detectSelector] Testing ${strategies.length} strategies...`);
    for (const strat of strategies) {
      try {
        if ((strat as any).isMeta) {
          const content = await page.getAttribute(strat.selector, 'content');
          if (content) {
            const val = parseFloat(content);
            if (!isNaN(val) && val > 0) {
              console.log(`[detectSelector] Found price with strategy "${strat.name}": ${val}`);
              return { selector: strat.selector, price: val, strategy: strat.name };
            }
          }
        } else {
          const count = await page.locator(strat.selector).count();
          if (count > 0) {
            // Check first 3 matches to find one with valid price
            for (let i = 0; i < Math.min(count, 3); i++) {
              const text = await page.locator(strat.selector).nth(i).innerText();
              const digits = text.replace(/\D/g, '');
              const val = digits ? parseInt(digits, 10) : null;
              if (val && val > 0) {
                console.log(`[detectSelector] Found price with strategy "${strat.name}": ${val}`);
                return { selector: strat.selector, price: val, strategy: strat.name };
              }
            }
          }
        }
      } catch (e) {
        console.log(`[detectSelector] Strategy "${strat.name}" failed: ${(e as Error).message}`);
      }
    }
    
    // Try JSON-LD structured data
    console.log(`[detectSelector] Trying JSON-LD structured data...`);
    try {
      const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
      if (ld) {
        const obj = JSON.parse(ld);
        const price = extractPriceFromJson(obj);
        if (price && price > 0) {
          console.log(`[detectSelector] Found price in JSON-LD: ${price}`);
          return { selector: 'ld+json', price, strategy: 'JSON-LD Offers' };
        }
      }
    } catch (e) {
      console.log(`[detectSelector] JSON-LD parsing failed: ${(e as Error).message}`);
    }
    
    // Try Next.js data
    console.log(`[detectSelector] Trying __NEXT_DATA__...`);
    try {
      const nextData = await page.locator('script#__NEXT_DATA__').first().textContent();
      if (nextData) {
        const obj = JSON.parse(nextData);
        const price = extractPriceFromJson(obj);
        if (price && price > 0) {
          console.log(`[detectSelector] Found price in __NEXT_DATA__: ${price}`);
          return { selector: '__NEXT_DATA__', price, strategy: 'NextData JSON' };
        }
      }
    } catch (e) {
      console.log(`[detectSelector] __NEXT_DATA__ parsing failed: ${(e as Error).message}`);
    }

    console.log(`[detectSelector] No price selector found for URL: ${url}`);
    return { selector: null, price: null, strategy: null };
  } catch (e) {
    console.error(`[detectSelector] Detection failed for ${url}:`, e);
    return { selector: null, price: null, strategy: null };
  } finally {
    try { if (page) await page.close(); } catch {}
    try { if (context) await context.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
  }
}

export async function runCheck(watcher: any): Promise<CheckResult> {
  let browser: any = null;
  let context: any = null;
  let page: any = null;
  const start = Date.now();

  console.log(`[runCheck] Starting check for watcher: ${watcher.name || watcher.url}`);
  console.log(`[runCheck] URL: ${watcher.url}`);
  console.log(`[runCheck] Price selector: ${watcher.price_selector}`);

  try {
    console.log(`[runCheck] Creating browser page...`);
    ({ browser, context, page } = await createPage(watcher.url));
    console.log(`[runCheck] Navigating to URL...`);
    const response = await page.goto(watcher.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    const statusCode = response ? response.status() : 'unknown';
    console.log(`[runCheck] Page loaded with status: ${statusCode}`);
    
    if (response && (response.status() === 403 || response.status() === 503)) {
        console.log(`[runCheck] Blocked by HTTP status ${response.status()}`);
        return {
            price_value: null,
            price_text: null,
            in_stock: null,
            status: 'BLOCKED',
            error_message: `HTTP Status ${response.status()}`,
            raw_excerpt: null,
            response_time_ms: Date.now() - start
        };
    }

    try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        console.log(`[runCheck] Network idle reached`);
    } catch (e) {
        console.log(`[runCheck] Network idle timeout (non-critical): ${(e as Error).message}`);
    }

    const content = await page.content();
    const lowerContent = content.toLowerCase();

    if (!process.env.DISABLE_CONTENT_BLOCK_DETECTION) {
        if (
          lowerContent.includes('access denied') ||
          lowerContent.includes('security check') ||
          lowerContent.includes('cloudflare') ||
          lowerContent.includes('robot check') ||
          lowerContent.includes('captcha')
        ) {
            return {
                price_value: null,
                price_text: null,
                in_stock: null,
                status: 'BLOCKED',
                error_message: 'Detected blocking page content',
                raw_excerpt: null,
                response_time_ms: Date.now() - start
            };
        }
    }

    console.log(`[runCheck] Looking for price selector: ${watcher.price_selector}`);
    let priceText = '';
    try {
        const locator = page.locator(watcher.price_selector).first();
        await locator.waitFor({ state: 'attached', timeout: 8000 });
        priceText = await locator.innerText();
        console.log(`[runCheck] Found price text: "${priceText}"`);
    } catch (e) {
        console.log(`[runCheck] Price selector not found: ${(e as Error).message}`);
        console.log(`[runCheck] Trying JSON-LD fallback...`);
        try {
          const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
          if (ld) {
            const obj = JSON.parse(ld);
            const price = extractPriceFromJson(obj);
            if (price && price > 0) {
              console.log(`[runCheck] Found price in JSON-LD fallback: ${price}`);
              return {
                price_value: price,
                price_text: `${price}`,
                in_stock: null,
                status: 'OK',
                error_message: null,
                raw_excerpt: `${price}`,
                response_time_ms: Date.now() - start
              };
            }
          }
        } catch (jsonError) {
          console.log(`[runCheck] JSON-LD fallback failed: ${(jsonError as Error).message}`);
        }
        console.log(`[runCheck] All price extraction methods failed`);
        return {
            price_value: null,
            price_text: null,
            in_stock: null,
            status: 'FAILED',
            error_message: 'Price selector not found',
            raw_excerpt: null,
            response_time_ms: Date.now() - start
        };
    }

    const digitsOnly = priceText.replace(/\D/g, '');
    const priceValue = digitsOnly ? parseInt(digitsOnly, 10) : null;

    let inStock = true; // Default
    let keywords: string[] = ['agotado', 'sin stock', 'out of stock', 'unavailable'];
    
    if (watcher.out_of_stock_keywords) {
        if (typeof watcher.out_of_stock_keywords === 'string') {
            try {
                keywords = JSON.parse(watcher.out_of_stock_keywords);
            } catch (e) {
                // If parse fails, treat as single keyword or ignore
                keywords = [watcher.out_of_stock_keywords];
            }
        } else if (Array.isArray(watcher.out_of_stock_keywords)) {
            keywords = watcher.out_of_stock_keywords;
        }
    }
    
    if (watcher.availability_strategy === 'OUT_OF_STOCK_TEXT_PRESENT') {
        const bodyText = (await page.locator('body').innerText()).toLowerCase();
        for (const kw of keywords) {
            if (bodyText.includes(kw.toLowerCase())) {
                inStock = false;
                break;
            }
        }
    } else if (watcher.availability_strategy === 'STOCK_TEXT_SELECTOR' && watcher.stock_selector) {
        try {
            const stockText = (await page.locator(watcher.stock_selector).first().innerText({ timeout: 2000 })).toLowerCase();
             for (const kw of keywords) {
                if (stockText.includes(kw.toLowerCase())) {
                    inStock = false;
                    break;
                }
            }
        } catch (e) {
            console.log(`[runCheck] Stock selector not found: ${(e as Error).message}`);
            // If selector not found, might imply stock presence or absence depending on site.
            // For MVP, we'll assume inStock if we can't prove otherwise via selector.
        }
    }

    console.log(`[runCheck] Check completed successfully - Price: ${priceValue}, In Stock: ${inStock}`);
    return {
        price_value: priceValue,
        price_text: priceText,
        in_stock: inStock,
        status: 'OK',
        error_message: null,
        raw_excerpt: priceText.substring(0, 100),
        response_time_ms: Date.now() - start
    };

  } catch (error: any) {
      console.error(`[runCheck] Check failed with error:`, error);
      return {
          price_value: null,
          price_text: null,
          in_stock: null,
          status: 'FAILED',
          error_message: error.message,
          raw_excerpt: null,
          response_time_ms: Date.now() - start
      };
  } finally {
      try { if (page) await page.close(); } catch {}
      try { if (context) await context.close(); } catch {}
      try { if (browser) await browser.close(); } catch {}
  }
}

function extractPriceFromJson(root: any): number | null {
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (cur && typeof cur === 'object') {
      if (typeof cur.price === 'number' && cur.price > 0) return cur.price;
      if (typeof cur.amount === 'number' && cur.amount > 0) return cur.amount;
      if (typeof cur.value === 'number' && cur.value > 0) return cur.value;
      if (cur.offers && typeof cur.offers === 'object') {
        const o = (Array.isArray(cur.offers) ? cur.offers[0] : cur.offers) || {};
        if (typeof o.price === 'number' && o.price > 0) return o.price;
        if (typeof o.price === 'string') {
          const n = parseFloat(o.price.replace(/[^\d.]/g, ''));
          if (!isNaN(n) && n > 0) return Math.round(n);
        }
      }
      for (const k of Object.keys(cur)) {
        stack.push(cur[k]);
      }
    }
  }
  return null;
}
