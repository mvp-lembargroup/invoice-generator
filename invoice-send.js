const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'invoice-config.json'), 'utf8'));

// === Config ===
const BOT_TOKEN = '8633450666:AAGOkQSOkZI4hqBw8zoLbfo5mUoZC_ldEsQ';
const CHAT_ID = '148792235';
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// === Generate HTML ===
function generateHTML(year, month) {
  const baseNumber = config.invoice.startNumber; // 67 = April 2026
  const baseYear = 2026;
  const baseMonth = 4;
  const monthsSince = (year - baseYear) * 12 + (month - baseMonth);
  const invoiceNum = baseNumber + monthsSince;
  const invoiceStr = config.invoice.prefix + String(invoiceNum).padStart(6, '0');

  const pad = (n) => String(n).padStart(2, '0');
  const invoiceDate = `${pad(25)}/${pad(month)}/${year}`;
  const dueMonth = month === 12 ? 1 : month + 1;
  const dueYear = month === 12 ? year + 1 : year;
  const dueDate = `01/${pad(dueMonth)}/${dueYear}`;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month - 1];
  const fmt = (n) => n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amount = config.invoice.amount;

  let html = fs.readFileSync(path.join(__dirname, 'invoice-template.html'), 'utf8');
  const replacements = {
    '{{COMPANY_NAME}}': config.company.name,
    '{{COMPANY_ADDRESS}}': config.company.address,
    '{{COMPANY_PHONE}}': config.company.phone,
    '{{COMPANY_EMAIL}}': config.company.email,
    '{{CLIENT_NAME}}': config.client.name,
    '{{CLIENT_ADDRESS}}': config.client.address,
    '{{INVOICE_NUMBER}}': invoiceStr,
    '{{INVOICE_NUMBER_SHORT}}': invoiceStr,
    '{{CURRENCY}}': config.invoice.currency === 'IDR' ? 'IDR' : '',
    '{{BALANCE_AMOUNT}}': fmt(amount),
    '{{INVOICE_DATE}}': invoiceDate,
    '{{DUE_DATE}}': dueDate,
    '{{ITEM_NAME}}': config.invoice.itemName,
    '{{ITEM_DESCRIPTION}}': config.invoice.description.replace('{MONTH}', monthName).replace('{YEAR}', String(year)),
    '{{AMOUNT}}': fmt(amount),
    '{{BANK_NAME}}': config.payment.bank,
    '{{ACCOUNT_NAME}}': config.payment.accountName,
    '{{ACCOUNT_NUMBER}}': config.payment.accountNumber,
    '{{SWIFT_CODE}}': config.payment.swiftCode,
    '{{BRANCH_CODE}}': config.payment.branchCode,
    '{{BANK_CODE}}': config.payment.bankCode,
    '{{WISE_EMAIL}}': config.payment.wise.email,
    '{{PHONE_NUMBER}}': config.payment.wise.phone,
  };
  for (const [k, v] of Object.entries(replacements)) html = html.split(k).join(v);

  return { html, invoiceStr, invoiceDate, dueDate, monthName, amount: fmt(amount) };
}

// === Send to Telegram ===
function sendToTelegram(filePath, caption) {
  return new Promise((resolve, reject) => {
    const boundary = '----' + Math.random().toString(36).slice(2);
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="document"; filename="${fileName}"\r\n`;
    body += `Content-Type: application/pdf\r\n\r\n`;

    const bodyStart = Buffer.from(body, 'utf8');
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

    // caption part
    let captionPart = '';
    captionPart += `--${boundary}\r\n`;
    captionPart += `Content-Disposition: form-data; name="caption"\r\n\r\n`;
    captionPart += caption + '\r\n';
    const captionBuf = Buffer.from(captionPart, 'utf8');

    const totalLength = bodyStart.length + fileData.length + captionBuf.length + bodyEnd.length;

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendDocument?chat_id=${CHAT_ID}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLength,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) resolve(json);
          else reject(new Error(`Telegram error: ${json.description}`));
        } catch (e) {
          reject(new Error(`Response: ${data}`));
        }
      });
    });
    req.on('error', reject);

    req.write(bodyStart);
    req.write(fileData);
    req.write(captionBuf);
    req.write(bodyEnd);
    req.end();
  });
}

// === Send Email via Telegram (forward) ===
async function sendEmail(email, subject, body, attachmentPath) {
  // For now, we deliver via Telegram first. Email can be set up later.
  console.log(`Email delivery to ${email} - requires SMTP setup. Skipping for now.`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${body}`);
}

// === Main ===
async function main() {
  const now = new Date();
  const year = parseInt(process.argv[2]) || now.getFullYear();
  const month = parseInt(process.argv[3]) || (now.getMonth() + 1);

  console.log(`[${new Date().toISOString()}] Generating invoice for ${month}/${year}...`);

  // 1. Generate HTML
  const { html, invoiceStr, invoiceDate, dueDate, monthName, amount } = generateHTML(year, month);

  // 2. Write HTML
  const htmlPath = path.join(OUTPUT_DIR, `${invoiceStr}.html`);
  fs.writeFileSync(htmlPath, html);

  // 3. Convert to PDF
  const pdfPath = path.join(OUTPUT_DIR, `${invoiceStr}.pdf`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
  await browser.close();

  console.log(`PDF: ${pdfPath}`);

  // 4. Send to Telegram
  const caption = `📄 *Invoice ${invoiceStr}*\n${config.invoice.itemName} ${monthName} ${year}\n💰 IDR ${amount}\n📅 Due: ${dueDate}`;
  const result = await sendToTelegram(pdfPath, caption);
  console.log(`Telegram: OK (message_id: ${result.result.message_id})`);

  // 5. Email (placeholder)
  if (config.delivery.email) {
    await sendEmail(
      config.delivery.email,
      `Invoice ${invoiceStr} - ${config.invoice.itemName} ${monthName} ${year}`,
      `Dear Sleek EV Pte Ltd,\n\nPlease find attached invoice ${invoiceStr} for ${config.invoice.itemName} ${monthName} ${year}.\n\nAmount: IDR ${amount}\nDue Date: ${dueDate}\n\nThank you.`,
      pdfPath
    );
  }

  console.log(`[${new Date().toISOString()}] Done.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
