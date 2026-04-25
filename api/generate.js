// Vercel Serverless Function — /api/generate
// Pure Node.js PDF generation using pdfkit (no Chromium needed)
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'invoice-config.json'), 'utf8')
);
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// ========== HELPERS ==========

function generateInvoiceData(year, month) {
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

  return { invStr, invDate, dueDate, mon, year, month, amount: config.invoice.amount };
}

function buildPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmt = n => n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const C = '#2c3e50';
    const R = '#e74c3c';
    const G = '#888';
    const font = 'Helvetica';

    doc.registerFont('Helvetica', 'Helvetica');
    doc.registerFont('Helvetica-Bold', 'Helvetica-Bold');

    // ----- Header -----
    doc.fontSize(9).fillColor(G).text('INVOICE', 50, 45);
    doc.fontSize(28).fillColor(C).font(font).text(config.company.name, 50, 55);

    // Right side: invoice number & balance
    doc.fontSize(11).fillColor(C).font(font).text(data.invStr, 350, 45, { align: 'right' });
    
    const amtFormatted = fmt(data.amount);
    doc.fontSize(9).fillColor(R).text('BALANCE DUE', 350, 65, { align: 'right' });
    doc.fontSize(16).fillColor(R).font(font).text(`IDR${amtFormatted}`, 350, 78, { align: 'right' });

    // ----- Line -----
    doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#ddd').stroke();

    // ----- Info Grid -----
    const iy = 130;
    doc.fontSize(9).fillColor(G).text('FROM', 50, iy);
    doc.fontSize(12).fillColor(C).font(font).text(config.company.name, 50, iy + 14);
    doc.fontSize(10).fillColor('#555').font(font).text(
      `${config.company.address}\n${config.company.phone}\n${config.company.email}`,
      50, iy + 32
    );

    doc.fontSize(9).fillColor(G).text('TO', 310, iy);
    doc.fontSize(12).fillColor(C).font(font).text(config.client.name, 310, iy + 14);
    doc.fontSize(10).fillColor('#555').font(font).text(config.client.address, 310, iy + 32);

    // ----- Due Date & Dates -----
    const dy = 240;
    doc.fontSize(9).fillColor(G).text('Invoice Date', 50, dy);
    doc.fontSize(10).fillColor('#555').font(font).text(data.invDate, 50, dy + 14);

    doc.fontSize(9).fillColor(G).text('Due Date', 310, dy);
    doc.fontSize(13).fillColor(R).font(font).text(data.dueDate, 310, dy + 10);

    // ----- Items Table -----
    const ty = 290;
    doc.rect(50, ty, 495, 22).fill(C);
    doc.fillColor('#fff').fontSize(9).font(font).text('#', 58, ty + 6);
    doc.text('Item & Description', 100, ty + 6);
    doc.text('Amount', 450, ty + 6, { align: 'right' });

    // Item row
    doc.fillColor('#333').fontSize(10).font(font).text('1', 58, ty + 35);
    doc.fontSize(11).fillColor(C).font(font).text(config.invoice.itemName, 100, ty + 35);
    doc.fontSize(9).fillColor(G).font(font).text(
      config.invoice.description.replace('{MONTH}', data.mon).replace('{YEAR}', String(data.year)),
      100, ty + 52
    );
    doc.fontSize(9).fillColor(G).font(font).text(
      `IDR${fmt(config.invoice.amount)} x 1.00`,
      100, ty + 66
    );
    doc.fontSize(10).fillColor('#333').font(font).text(`IDR${fmt(config.invoice.amount)}.00`, 450, ty + 35, { align: 'right' });

    // Line under item
    const lineY = ty + 92;
    doc.moveTo(50, lineY).lineTo(545, lineY).strokeColor('#eee').stroke();

    // Totals
    const tY = lineY + 10;
    doc.fontSize(10).fillColor('#555').font(font).text('Sub Total', 400, tY, { align: 'right' });
    doc.text(`IDR${fmt(data.amount)}.00`, 450, tY, { align: 'right' });

    doc.fontSize(13).fillColor(C).font(font).text('Total', 400, tY + 22, { align: 'right' });
    doc.text(`IDR${fmt(data.amount)}.00`, 450, tY + 22, { align: 'right' });

    const bY = tY + 50;
    doc.moveTo(350, bY).lineTo(545, bY).strokeColor(R);
    doc.fontSize(14).fillColor(R).font(font).text('Balance Due', 350, bY + 8, { align: 'right' });
    doc.text(`IDR${fmt(data.amount)}.00`, 350, bY + 26, { align: 'right' });

    // ----- Payment Section -----
    const pY = 520;
    doc.moveTo(50, pY).lineTo(545, pY).strokeColor('#ddd').stroke();
    doc.fontSize(10).fillColor(C).font(font).text('Please make payment to:', 50, pY + 12);
    doc.fontSize(10).fillColor('#555').font(font).text(
      `${config.payment.bank} (${config.payment.accountName})\n` +
      `Account Number: ${config.payment.accountNumber}\n` +
      `SWIFT Code: ${config.payment.swiftCode}\n` +
      `Branch Code: ${config.payment.branchCode}\n` +
      `Bank Code: ${config.payment.bankCode}\n` +
      `Wise Account: ${config.payment.wise.email}\n` +
      `Phone: ${config.payment.wise.phone}`,
      50, pY + 28
    );

    // Footer
    doc.fontSize(8).fillColor(G).font(font).text(
      `Invoice# ${data.invStr}  |  Invoice Date ${data.invDate}  |  Generated by Jarvis 🤖`,
      50, 780, { align: 'center' }
    );

    doc.end();
  });
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
      hostname: 'api.telegram.org', method: 'POST',
      path: `/bot${botToken}/sendDocument?chat_id=${chatId}`,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': head.length + buf.length + tail.length },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { const j = JSON.parse(data); if (j.ok) resolve(j); else reject(new Error(j.description)); } catch(e) { reject(new Error(data)); } });
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
    const data = generateInvoiceData(year, month);
    const pdf = await buildPdf(data);

    const fileName = `${data.invStr}.pdf`;
    const caption = `📄 *Invoice ${data.invStr}*\n${config.invoice.itemName} ${data.mon} ${data.year}\n💰 IDR ${fmt(data.amount)}\n📅 Due: ${data.dueDate}`;

    // Send to Telegram on cron or if no manual query params specified
    if (botToken && chatId && (req.headers['x-vercel-cron'] === '1' || (!req.query?.year && !req.query?.month))) {
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

// Helper used in template
function fmt(n) {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
