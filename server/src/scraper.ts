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

export async function detectSelector(url: string): Promise<{ selector: string | null; price: number | null; strategy: string | null }> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch (e) {}

    const strategies = [
      { name: 'VTEX Standard', selector: '.vtex-product-price-1-x-sellingPriceValue' },
      { name: 'VTEX Container', selector: '.vtex-product-price-1-x-sellingPrice' },
      { name: 'Electrolux Custom', selector: '.electrolux-product-prices-4-x-sellingPriceValue' },
      { name: 'Electrolux Container', selector: '.electrolux-product-prices-4-x-sellingPrice' },
      { name: 'MercadoLibre', selector: '.ui-pdp-price__second-line .andes-money-amount__fraction' },
      { name: 'Ripley', selector: '.product-price' },
      { name: 'Linio', selector: '.price-main-md' },
      { name: 'Schema.org', selector: '[itemprop="price"]' },
      { name: 'OpenGraph', selector: 'meta[property="product:price:amount"]', isMeta: true },
      { name: 'Generic ID', selector: '#price' },
      { name: 'Generic Class', selector: '.price' },
      { name: 'Generic Product Price', selector: '.product-price' }
    ];

    for (const strat of strategies) {
      try {
        if (strat.isMeta) {
          const content = await page.getAttribute(strat.selector, 'content');
          if (content) {
            const val = parseFloat(content);
            if (!isNaN(val) && val > 0) {
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
                 return { selector: strat.selector, price: val, strategy: strat.name };
              }
            }
          }
        }
      } catch (e) {
        // Ignore failures for specific strategies
      }
    }
    
    return { selector: null, price: null, strategy: null };
  } catch (e) {
    console.error('Detection failed:', e);
    return { selector: null, price: null, strategy: null };
  } finally {
    await browser.close();
  }
}

export async function runCheck(watcher: any): Promise<CheckResult> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({
    userAgent:
      process.env.PLAYWRIGHT_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  const start = Date.now();

  try {
    const response = await page.goto(watcher.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    if (response && (response.status() === 403 || response.status() === 503)) {
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
    } catch (e) {
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

    let priceText = '';
    try {
        const locator = page.locator(watcher.price_selector).first();
        await locator.waitFor({ state: 'attached', timeout: 8000 });
        priceText = await locator.innerText();
    } catch (e) {
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
            // If selector not found, might imply stock presence or absence depending on site. 
            // For MVP, we'll assume inStock if we can't prove otherwise via selector.
        }
    }

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
      await browser.close();
  }
}
