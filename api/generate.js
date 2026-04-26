// Vercel Serverless — /api/generate
// HTML → PDF via @sparticuz/chromium + puppeteer-core
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const https = require('https');
const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'invoice-config.json'), 'utf8')
);

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

function fmt(n) {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateInvoiceData(year, month) {
  const baseNum = config.invoice.startNumber;
  const offset = (year - 2026) * 12 + (month - 4);
  const invNum = baseNum + offset;
  const invStr = config.invoice.prefix + String(invNum).padStart(6, '0');
  const pad = n => String(n).padStart(2, '0');
  const invDate = `${pad(25)}/${pad(month)}/${year}`;
  const dMonth = month === 12 ? 1 : month + 1;
  const dYear = month === 12 ? year + 1 : year;
  const dueDate = `01/${pad(dMonth)}/${dYear}`;
  const names = ['January','February','March','April','May','June', 'July','August','September','October','November','December'];
  return { invStr, invDate, dueDate, mon: names[month-1], year, month, amount: config.invoice.amount };
}

function buildHtml(data) {
  const a = fmt(data.amount);
  const [invD, dueD] = [data.invDate, data.dueDate];
  const { invStr, mon, year: y } = data;
  const { company, client, invoice, payment } = config;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
@page { margin: 20mm 15mm; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; font-size: 11px; line-height: 1.5; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.header-left h2 { color: #7f8c8d; font-size: 10px; font-weight: normal; margin-bottom: 4px; }
.header-left h1 { font-size: 28px; color: #2c3e50; font-weight: bold; }
.header-right { text-align: right; }
.header-right .inv-no { font-size: 12px; color: #2c3e50; }
.header-right .bal-label { font-size: 9px; color: #e74c3c; margin-top: 8px; }
.header-right .bal-amt { font-size: 16px; color: #e74c3c; font-weight: bold; }
.line { border: none; border-top: 1px solid #ddd; margin: 10px 0; }
.info-grid { display: flex; gap: 80px; margin-bottom: 20px; }
.info-grid h3 { font-size: 9px; color: #7f8c8d; font-weight: normal; margin-bottom: 4px; }
.info-grid .name { font-size: 12px; color: #2c3e50; font-weight: bold; margin-bottom: 2px; }
.info-grid .detail { font-size: 10px; color: #555; white-space: pre-line; }
.dates { display: flex; gap: 60px; margin-bottom: 16px; }
.dates h4 { font-size: 8px; color: #7f8c8d; font-weight: normal; margin-bottom: 2px; }
.dates .val { font-size: 11px; color: #333; }
.dates .due-val { font-size: 11px; color: #e74c3c; font-weight: bold; }
table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
th { background: #2c3e50; color: #fff; font-size: 9px; text-align: left; padding: 7px 8px; }
th:last-child { text-align: right; }
td { padding: 10px 8px; }
.item-row td { background: #f9f9f9; vertical-align: top; }
.item-title { font-size: 11px; color: #2c3e50; font-weight: bold; }
.item-desc { font-size: 9px; color: #7f8c8d; }
.item-amt { font-size: 10px; color: #333; text-align: right; white-space: nowrap; }
.totals { width: 280px; margin-left: auto; }
.totals td { padding: 3px 8px; }
.totals .label { font-size: 9px; color: #7f8c8d; text-align: left; }
.totals .value { font-size: 10px; color: #333; text-align: right; white-space: nowrap; }
.totals .sep td { border-top: 1px solid #ddd; padding: 0; height: 1px; }
.totals .bal-label { font-size: 10px; color: #e74c3c; border-top: 2px solid #e74c3c; padding-top: 6px; }
.totals .bal-value { font-size: 13px; color: #e74c3c; font-weight: bold; border-top: 2px solid #e74c3c; padding-top: 6px; text-align: right; white-space: nowrap; }
.payment { border-top: 1px solid #ddd; padding-top: 10px; margin-top: 10px; }
.payment h4 { font-size: 10px; color: #2c3e50; margin-bottom: 6px; }
.payment p { font-size: 9px; color: #555; line-height: 1.6; }
.footer { font-size: 8px; color: #7f8c8d; text-align: center; margin-top: 40px; }
</style></head><body>
<div class="header">
  <div class="header-left">
    <h2>INVOICE</h2>
    <h1>${company.name}</h1>
  </div>
  <div class="header-right">
    <div class="inv-no">${invStr}</div>
    <div class="bal-label">BALANCE DUE</div>
    <div class="bal-amt">IDR ${a}</div>
  </div>
</div>
<hr class="line">
<div class="info-grid">
  <div>
    <h3>FROM</h3>
    <div class="name">${company.name}</div>
    <div class="detail">${company.address}\n${company.phone}\n${company.email}</div>
  </div>
  <div>
    <h3>TO</h3>
    <div class="name">${client.name}</div>
    <div class="detail">${client.address}</div>
  </div>
</div>
<div class="dates">
  <div><h4>INVOICE DATE</h4><div class="val">${invD}</div></div>
  <div><h4>TERMS</h4><div class="val">Custom</div></div>
  <div><h4>DUE DATE</h4><div class="due-val">${dueD}</div></div>
</div>
<table>
  <tr><th style="width:30px">#</th><th>ITEM & DESCRIPTION</th><th style="width:140px">AMOUNT</th></tr>
  <tr class="item-row">
    <td>1</td>
    <td>
      <div class="item-title">${invoice.itemName}</div>
      <div class="item-desc">${invoice.description.replace('{MONTH}', mon).replace('{YEAR}', String(y))}</div>
      <div class="item-desc">IDR ${a} x 1.00</div>
    </td>
    <td class="item-amt">IDR ${a}</td>
  </tr>
</table>
<table class="totals">
  <tr><td class="label">Sub Total</td><td class="value">IDR ${a}</td></tr>
  <tr class="sep"><td colspan="2"></td></tr>
  <tr><td class="label" style="font-size:11px;color:#2c3e50;font-weight:bold">Total</td><td class="value" style="font-size:11px;font-weight:bold">IDR ${a}</td></tr>
  <tr><td class="bal-label">Balance Due</td><td class="bal-value">IDR ${a}</td></tr>
</table>
<div class="payment">
  <h4>Please make payment to:</h4>
  <p>
    ${payment.bank} (${payment.accountName})<br>
    Account Number: ${payment.accountNumber}<br>
    SWIFT Code: ${payment.swiftCode} | Branch: ${payment.branchCode} | Bank Code: ${payment.bankCode}<br>
    Wise: ${payment.wise.email} | Phone: ${payment.wise.phone}
  </p>
</div>
<div class="footer">Invoice# ${invStr} | Invoice Date ${invD} | Generated by Jarvis</div>
</body></html>`;
}

async function generatePdf(data) {
  const html = buildHtml(data);
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 800, height: 1100 },
    executablePath: await chromium.executablePath(),
    headless: 'true',
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
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
      method: 'POST',
      path: `/bot${botToken}/sendDocument?chat_id=${chatId}`,
      headers: {
