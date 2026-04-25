// Vercel Serverless Function — /api/generate
// Pure Node.js PDF with pdfkit, Zoho-style design
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

function formatAmount(n) {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

    const fmt = formatAmount;
    const C = '#2c3e50';      // dark blue-gray
    const LB = '#34495e';     // lighter blue-gray
    const R = '#e74c3c';      // red for due/balance
    const G = '#7f8c8d';      // gray for labels
    const LIGHT_BG = '#ecf0f1'; // light gray bg

    let y = 50;

    // ===== HEADER =====
    // Left: "INVOICE" label + company name
    doc.fontSize(9).fillColor(G).font('Helvetica').text('INVOICE', 50, y);
    doc.fontSize(28).fillColor(C).font('Helvetica').text(config.company.name, 50, y + 10);

    // Right: Invoice number + Balance Due
    doc.fontSize(11).fillColor(C).font('Helvetica').text(data.invStr, 320, y, { align: 'right' });
    doc.fontSize(8).fillColor(R).text('BALANCE DUE', 320, y + 18, { align: 'right' });
    doc.fontSize(11).fillColor(R).font('Helvetica').text(`IDR${fmt(data.amount)}`, 320, y + 30, { align: 'right' });

    // ===== SEPARATOR =====
    y = 105;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke();

    // ===== FROM / TO =====
    y = 125;
    // FROM
    doc.fontSize(9).fillColor(G).text('FROM', 50, y);
    doc.fontSize(12).fillColor(C).font('Helvetica').text(config.company.name, 50, y + 14);
    doc.fontSize(10).fillColor('#555').font('Helvetica').text(
      `${config.company.address}\n${config.company.phone}\n${config.company.email}`,
      50, y + 32
    );

    // TO
    doc.fontSize(9).fillColor(G).text('TO', 310, y);
    doc.fontSize(12).fillColor(C).font('Helvetica').text(config.client.name, 310, y + 14);
    doc.fontSize(10).fillColor('#555').font('Helvetica').text(config.client.address, 310, y + 32);

    // ===== DATES =====
    y = 240;
    // Invoice Date
    doc.fontSize(8).fillColor(G).text('INVOICE DATE', 50, y);
    doc.fontSize(11).fillColor('#333').font('Helvetica').text(data.invDate, 50, y + 12);
    doc.fontSize(8).fillColor(G).text('TERMS', 50, y + 32);
    doc.fontSize(11).fillColor('#333').font('Helvetica').text('Custom', 50, y + 44);

    // Due Date - highlighted red box
    const dueBoxX = 340;
    doc.roundedRect(dueBoxX, y, 205, 50, 4).fillColor('#fdf0ef').fill();
    doc.fillColor(R).font('Helvetica');
    doc.fontSize(8).text('DUE DATE', dueBoxX + 8, y + 8);
    doc.fontSize(12).text(data.dueDate, dueBoxX + 8, y + 22);

    // ===== TABLE HEADER =====
    y = 315;
    doc.rect(50, y, 495, 25).fillColor(C).fill();
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica');
    doc.text('#', 58, y + 7);
    doc.text('ITEM & DESCRIPTION', 90, y + 7);
    doc.text('AMOUNT', 545, y + 7, { align: 'right' });

    // ===== TABLE ITEM =====
    y = 345;
    doc.fillColor('#333').fontSize(10).font('Helvetica');

    // Row background
    doc.rect(50, y, 495, 80).fillColor('#fafafa').fill();
    
    doc.fillColor('#333').font('Helvetica').text('1', 58, y + 10);
    doc.fontSize(11).fillColor(C).font('Helvetica').text(config.invoice.itemName, 90, y + 10);
    doc.fontSize(9).fillColor(G).font('Helvetica').text(
      config.invoice.description.replace('{MONTH}', data.mon).replace('{YEAR}', String(data.year)),
      90, y + 28
    );
    doc.fontSize(9).fillColor(G).font('Helvetica').text(
      `IDR${fmt(data.amount)} x 1.00`,
      90, y + 42
    );
    doc.fontSize(9).fillColor('#333').font('Helvetica').text(`IDR${fmt(data.amount)}`, 545, y + 10, { align: 'right' });

    // ===== TOTALS =====
    y = 435;
    const totalW = 215;
    const totalX = 545 - totalW;

    // Sub Total
    doc.fontSize(9).fillColor(G).font('Helvetica').text('Sub Total', totalX, y);
    doc.text(`IDR${fmt(data.amount)}`, totalX + 140, y, { align: 'right' });

    // Total
    doc.fontSize(10).fillColor(C).font('Helvetica').text('Total', totalX, y + 22);
    doc.text(`IDR${fmt(data.amount)}`, totalX + 140, y + 22, { align: 'right' });
    doc.moveTo(totalX - 10, y + 18).lineTo(545, y + 18).strokeColor(C).stroke();

    // Balance Due - red line + amount
    y = y + 50;
    doc.moveTo(545 - totalW - 10, y).lineTo(545, y).strokeColor(R).stroke();
    doc.fontSize(9).fillColor(R).font('Helvetica').text('Balance Due', totalX, y + 8);
    doc.fontSize(12).fillColor(R).font('Helvetica').text(`IDR${fmt(data.amount)}`, totalX + 140, y + 6, { align: 'right' });

    // ===== PAYMENT SECTION =====
    y = 530;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke();
    
    // Payment title with accent bar
    doc.rect(50, y + 8, 3, 14).fillColor(C).fill();
    doc.fontSize(10).fillColor(C).font('Helvetica').text('Please make payment to:', 60, y + 10);

    // Payment details - 2 column layout
    y = y + 30;
    const payInfo = [
      `${config.payment.bank} (${config.payment.accountName})`,
      `Account Number: ${config.payment.accountNumber}`,
      `SWIFT Code: ${config.payment.swiftCode}`,
      `Branch Code: ${config.payment.branchCode}`,
      `Bank Code: ${config.payment.bankCode}`,
      `Wise Account: ${config.payment.wise.email}`,
      `Phone: ${config.payment.wise.phone}`,
    ];

    doc.fontSize(9.5).fillColor('#555').font('Helvetica');
    payInfo.forEach((line, i) => {
      doc.text(line, 60, y + (i * 14));
    });

    // ===== FOOTER =====
    doc.fontSize(8).fillColor(G).font('Helvetica').text(
      `Invoice# ${data.invStr}  •  Invoice Date ${data.invDate}  •  Generated by Jarvis`,
      50, 790, { align: 'center' }
    );

    doc.end();
  });
}

// ========== TELEGRAM SEND ==========

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
    const amt = formatAmount(data.amount);
    const caption = `📄 *Invoice ${data.invStr}*\n${config.invoice.itemName} ${data.mon} ${data.year}\n💰 IDR ${amt}\n📅 Due: ${data.dueDate}`;

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
