import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { runCheck } from './scraper';
import { Resend } from 'resend';

const prisma = new PrismaClient();
const resend = process.env.RESEND_KEY ? new Resend(process.env.RESEND_KEY) : null;
const domainLastRun: Record<string, number> = {};
const domainBlockedUntil: Record<string, number> = {};
const domainMinIntervalMs = Number(process.env.DOMAIN_MIN_INTERVAL_MS || 60000);
const domainBlockCooldownMs = Number(process.env.DOMAIN_BLOCK_COOLDOWN_MS || 7200000);

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkWatcher(watcher: any) {
  console.log(`Running check for ${watcher.name}...`);
  let attempt = 0;
  let lastResult: any = null;

  while (attempt < 3) {
    const result = await runCheck(watcher);
    lastResult = result;

    const lastCheck = await prisma.check.findFirst({
      where: { watcher_id: watcher.id, status: 'OK' },
      orderBy: { created_at: 'desc' }
    });

    await prisma.check.create({
      data: {
        watcher_id: watcher.id,
        ...result
      }
    });

    if (result.status === 'OK' || result.status === 'BLOCKED') {
      if (result.status !== 'OK') {
        console.log(`Check failed for ${watcher.name}: ${result.error_message}`);
        if (result.status === 'BLOCKED') {
          const domain = watcher.store_domain;
          domainBlockedUntil[domain] = Date.now() + domainBlockCooldownMs;
          console.log(`Domain ${domain} marked as BLOCKED until ${new Date(domainBlockedUntil[domain]).toISOString()}`);
        }
      }
      if (result.status === 'OK' && lastCheck) {
        if (watcher.alert_on_drop && result.price_value && lastCheck.price_value && result.price_value < lastCheck.price_value) {
          await sendNotification(watcher, 'PRICE_DROP', `Price dropped from $${lastCheck.price_value} to $${result.price_value}`);
        }

        if (watcher.target_price && result.price_value && result.price_value <= watcher.target_price) {
          await sendNotification(watcher, 'TARGET_REACHED', `Price reached target: $${result.price_value} (Target: $${watcher.target_price})`);
        }

        if (watcher.alert_on_back_in_stock && result.in_stock && lastCheck.in_stock === false) {
          await sendNotification(watcher, 'BACK_IN_STOCK', `Item is back in stock!`);
        }
      }

      return;
    }

    attempt += 1;
    const backoffMs = attempt * 5000;
    await delay(backoffMs);
  }

  if (lastResult) {
    console.log(`Final failed check for ${watcher.name}: ${lastResult.error_message}`);
  }
}

async function sendNotification(watcher: any, type: string, message: string) {
  console.log(`[NOTIFICATION] ${type} for ${watcher.name}: ${message}`);

  await prisma.notification.create({
    data: {
      watcher_id: watcher.id,
      type,
      channel: 'EMAIL',
      status: resend ? 'SENT' : 'FAILED',
      payload: { message }
    }
  });

  if (resend) {
    try {
      await resend.emails.send({
        from: 'PriceWatch <onboarding@resend.dev>',
        to: ['user@example.com'],
        subject: `PriceWatch Alert: ${watcher.name}`,
        html: `<p>${message}</p><p><a href="${watcher.url}">Go to Product</a></p>`
      });
    } catch (e) {
      console.error('Failed to send email', e);
    }
  }
}

export async function runDueChecksOnce() {
  const watchers = await prisma.watcher.findMany({ where: { enabled: true } });
  const now = Date.now();

  for (const watcher of watchers) {
    const domain = watcher.store_domain;
    const blockedUntil = domainBlockedUntil[domain] || 0;

    if (now < blockedUntil) {
      continue;
    }

    const lastCheck = await prisma.check.findFirst({
      where: { watcher_id: watcher.id },
      orderBy: { created_at: 'desc' }
    });

    const nextRunTime = lastCheck
      ? lastCheck.created_at.getTime() + watcher.check_frequency_minutes * 60000
      : now;

    if (now < nextRunTime) {
      continue;
    }

    const lastDomainRun = domainLastRun[domain] || 0;

    if (now - lastDomainRun < domainMinIntervalMs) {
      continue;
    }

    domainLastRun[domain] = now;
    checkWatcher(watcher);
  }
}

export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    await runDueChecksOnce();
  });
  console.log('Scheduler started.');
}
