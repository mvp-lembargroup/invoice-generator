// Vercel Serverless Function — /api/generate
// Uses @sparticuz/chromium (optimized for Vercel) + playwright-core
const chromium = require('@sparticuz/chromium');
const { chromium: playwright } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const https = require('https');

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'invoice-config.json'), 'utf8')
);
const botToken = process.env.TELEGRAM_BOT_TOKEN || '8633450666:AAGOkQSOkZI4hqBw8zoLbfo5mUoZC_ldEsQ';
const chatId = process.env.TELEGRAM_CHAT_ID || '148792235';

// ========== HELPERS ==========

function generateHTML(year, month) {
  const baseNum = config.invoice.startNumber;
  const baseY = 2026, baseM = 4;
  const offset = (year - baseY) * 12 + (month - baseM);
  const invNum = baseNum + offset;
  const invStr = config.invoice.prefix + String(invNum).padStart(6, '0');

  const pad = n => String(n).padStart(2, '0');
  const invDate = `${pad(25)}/${pad(month)}/${year}`;
  const dMonth = month === 12 ? 1 : month + 1;
  const dYear = month === 12 ? year + 1 : year;
  const dueDate = `01/${pad(dMonth)}/${dYear}`;

  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  const mon = names[month - 1];
  const fmt = n => n.toLocaleString('id-ID', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const amt = config.invoice.amount;

  let html = fs.readFileSync(path.join(__dirname, '..', 'invoice-template.html'), 'utf8');
  const reps = {
    '{{COMPANY_NAME}}': config.company.name,
    '{{COMPANY_ADDRESS}}': config.company.address,
    '{{COMPANY_PHONE}}': config.company.phone,
    '{{COMPANY_EMAIL}}': config.company.email,
    '{{CLIENT_NAME}}': config.client.name,
    '{{CLIENT_ADDRESS}}': config.client.address,
    '{{INVOICE_NUMBER}}': invStr,
    '{{INVOICE_NUMBER_SHORT}}': invStr,
    '{{CURRENCY}}': 'IDR',
    '{{BALANCE_AMOUNT}}': fmt(amt),
    '{{INVOICE_DATE}}': invDate,
    '{{DUE_DATE}}': dueDate,
    '{{ITEM_NAME}}': config.invoice.itemName,
    '{{ITEM_DESCRIPTION}}': config.invoice.description.replace('{MONTH}', mon).replace('{YEAR}', String(year)),
    '{{AMOUNT}}': fmt(amt),
    '{{BANK_NAME}}': config.payment.bank,
    '{{ACCOUNT_NAME}}': config.payment.accountName,
    '{{ACCOUNT_NUMBER}}': config.payment.accountNumber,
    '{{SWIFT_CODE}}': config.payment.swiftCode,
    '{{BRANCH_CODE}}': config.payment.branchCode,
    '{{BANK_CODE}}': config.payment.bankCode,
    '{{WISE_EMAIL}}': config.payment.wise.email,
    '{{PHONE_NUMBER}}': config.payment.wise.phone,
  };
  for (const [k, v] of Object.entries(reps)) html = html.split(k).join(v);
  return { html, invStr, invDate, dueDate, mon, amount: fmt(amt) };
}

async function htmlToPdf(html) {
  const execPath = await chromium.executablePath();
  const browser = await playwright.launch({
    executablePath: execPath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--single-process',
      '--disable-dev-shm-usage',
      '--no-zygote',
    ],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const buf = await page.pdf({ format: 'A4', printBackground: true, margin: { top:'20mm', bottom:'20mm', left:'15mm', right:'15mm' } });
  await browser.close();
  return buf;
}

function sendToTelegram(buf, fileName, caption) {
  return new Promise((resolve, reject) => {
    const boundary = '----' + Math.random().toString(36).slice(2);
    let body = '';
    body += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
    body += `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`;

    const head = Buffer.from(body, 'utf8');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendDocument?chat_id=${chatId}`,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': head.length + buf.length + tail.length },
    };

    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { const j = JSON.parse(data); if (j.ok) resolve(j); else reject(new Error(j.description)); }
        catch(e) { reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    req.write(head); req.write(buf); req.write(tail);
    req.end();
  });
}

// ========== HANDLER ==========

module.exports = async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query?.year) || now.getFullYear();
    const month = parseInt(req.query?.month) || (now.getMonth() + 1);

    console.log(`Generating ${month}/${year}...`);
    const { html, invStr, dueDate, mon, amount } = generateHTML(year, month);
    const pdf = await htmlToPdf(html);

    const fileName = `${invStr}.pdf`;
    const caption = `📄 *Invoice ${invStr}*\n${config.invoice.itemName} ${mon} ${year}\n💰 IDR ${amount}\n📅 Due: ${dueDate}`;

    // Send to Telegram on cron or if no manual query params
    if (req.headers['x-vercel-cron'] === '1' || (!req.query?.year && !req.query?.month)) {
      const r = await sendToTelegram(pdf, fileName, caption);
      console.log(`Telegram OK: msg=${r.result?.message_id}`);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
