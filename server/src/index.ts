import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { startScheduler, runDueChecksOnce } from './scheduler';
import { runCheck, detectSelector } from './scraper';
import path from 'path';
import { exec } from 'child_process';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

async function ensureSeedData() {
  const count = await prisma.watcher.count();
  if (count > 0) return;

  const watcher1 = await prisma.watcher.create({
    data: {
      name: 'Ejemplo Falabella',
      url: 'https://www.ejemplo-falabella.cl/producto-placeholder',
      store_domain: 'www.ejemplo-falabella.cl',
      currency: 'CLP',
      price_selector: '.product-price',
      availability_strategy: 'PRICE_SELECTOR_ONLY',
      out_of_stock_keywords: JSON.stringify(['agotado', 'sin stock']),
      alert_on_drop: true,
      alert_on_back_in_stock: true,
      check_frequency_minutes: 60,
      enabled: true
    }
  });

  const watcher2 = await prisma.watcher.create({
    data: {
      name: 'Ejemplo MercadoLibre',
      url: 'https://www.ejemplo-mercadolibre.cl/producto-placeholder',
      store_domain: 'www.ejemplo-mercadolibre.cl',
      currency: 'CLP',
      price_selector: '.price-tag-fraction',
      availability_strategy: 'OUT_OF_STOCK_TEXT_PRESENT',
      out_of_stock_keywords: JSON.stringify(['agotado', 'sin stock']),
      alert_on_drop: true,
      alert_on_back_in_stock: true,
      check_frequency_minutes: 45,
      enabled: true
    }
  });

  await prisma.check.createMany({
    data: [
      {
        watcher_id: watcher1.id,
        price_value: 599990,
        price_text: '$599.990',
        in_stock: true,
        status: 'OK',
        raw_excerpt: 'Precio normal: $599.990'
      },
      {
        watcher_id: watcher1.id,
        price_value: 549990,
        price_text: '$549.990',
        in_stock: true,
        status: 'OK',
        raw_excerpt: 'Oferta: $549.990'
      },
      {
        watcher_id: watcher2.id,
        price_value: 129999,
        price_text: '$129.999',
        in_stock: false,
        status: 'OK',
        raw_excerpt: 'Producto agotado'
      },
      {
        watcher_id: watcher2.id,
        price_value: 119999,
        price_text: '$119.999',
        in_stock: true,
        status: 'OK',
        raw_excerpt: 'Stock disponible'
      }
    ]
  });
}

// Watchers CRUD
app.get('/api/watchers', async (req, res) => {
    const watchers = await prisma.watcher.findMany({
        orderBy: { created_at: 'desc' },
        include: {
            checks: {
                take: 1,
                orderBy: { created_at: 'desc' }
            }
        }
    });
    res.json(watchers);
});

app.get('/api/watchers/:id', async (req, res) => {
    const watcher = await prisma.watcher.findUnique({
        where: { id: req.params.id },
        include: {
            checks: {
                take: 50,
                orderBy: { created_at: 'desc' }
            }
        }
    });
    res.json(watcher);
});

app.post('/api/watchers', async (req, res) => {
    try {
        const { url, out_of_stock_keywords } = req.body;
        const store_domain = new URL(url).hostname;
        const data = {
            ...req.body,
            store_domain,
            out_of_stock_keywords: out_of_stock_keywords ?? null
        };
        
        const watcher = await prisma.watcher.create({ data });
        res.json(watcher);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.put('/api/watchers/:id', async (req, res) => {
    const { out_of_stock_keywords } = req.body;
    const data = { ...req.body };
    if (out_of_stock_keywords !== undefined) {
        (data as any).out_of_stock_keywords = out_of_stock_keywords ?? null;
    }

    const watcher = await prisma.watcher.update({
        where: { id: req.params.id },
        data
    });
    res.json(watcher);
});

app.delete('/api/watchers/:id', async (req, res) => {
    await prisma.watcher.delete({ where: { id: req.params.id } });
    res.json({ success: true });
});

// Detect Selector Endpoint
app.post('/api/detect-selector', async (req, res) => {
    try {
        const { url } = req.body;
        const result = await detectSelector(url);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Test Endpoint (Wizard)
app.post('/api/test-check', async (req, res) => {
    const { url, price_selector, stock_selector, availability_strategy } = req.body;
    // Mock watcher object for the function
    const mockWatcher = {
        url,
        price_selector,
        stock_selector,
        availability_strategy,
        out_of_stock_keywords: req.body.out_of_stock_keywords
    };
    const result = await runCheck(mockWatcher);
    res.json(result);
});

// Admin: Run checks manually
app.post('/api/jobs/run-checks', async (req, res) => {
    await runDueChecksOnce();
    res.json({ message: "Checks executed" });
});

const staticDir = path.resolve(__dirname, '../public');
app.use(express.static(staticDir));
app.get('*', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
});

function runMigrations(): Promise<void> {
    return new Promise((resolve, reject) => {
        exec('npx prisma db push', { cwd: path.resolve(__dirname, '../') }, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    try {
        await runMigrations();
        await ensureSeedData();
    } catch (e) {}
    startScheduler();
});
