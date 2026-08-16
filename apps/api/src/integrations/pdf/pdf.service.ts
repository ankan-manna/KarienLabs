import { readFile } from 'fs/promises';
import path from 'path';

import Handlebars from 'handlebars';
import puppeteer, { type Browser } from 'puppeteer';

let browserPromise: Promise<Browser> | null = null;

/** A single shared headless Chromium instance, reused across renders in the worker process. */
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
  }
  return browserPromise;
}

const templateCache = new Map<string, Handlebars.TemplateDelegate>();

async function loadTemplate(name: string): Promise<Handlebars.TemplateDelegate> {
  const cached = templateCache.get(name);
  if (cached) return cached;

  const filePath = path.join(__dirname, 'templates', `${name}.hbs`);
  const source = await readFile(filePath, 'utf8');
  const compiled = Handlebars.compile(source);
  templateCache.set(name, compiled);
  return compiled;
}

export async function renderPdf(
  templateName: string,
  data: Record<string, unknown>,
): Promise<Buffer> {
  const template = await loadTemplate(templateName);
  const html = template(data);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function closePdfBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
