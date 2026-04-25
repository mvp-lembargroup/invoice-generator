// Vercel Serverless Function — /api/generate
// Pure Node.js PDF using pdfkit — clean layout, all numbers fit 1 line
const PDFDocument = require('pdfkit');
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
  return { invStr, invDate, dueDate, mon: names[month-1], year, month, amount: config.invoice.amount };
}

function buildPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const a = fmt(data.amount);
    let y = 50;

    // ---- TOP: INVOICE header ----
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('INVOICE', 50, y);
    doc.fontSize(26).fillColor('#2c3e50').font('Helvetica').text(config.company.name, 50, y + 10);

    // Right: invoice num
    doc.fontSize(10).fillColor('#2c3e50').font('Helvetica').text(data.invStr, 380, y, { align: 'right' });
    doc.fontSize(8).fillColor('#e74c3c').text('BALANCE DUE', 380, y + 16, { align: 'right' });
    doc.fontSize(13).fillColor('#e74c3c').font('Helvetica').text(`IDR ${a}`, 380, y + 28, { align: 'right' });

    y = 105;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke();

    // ---- FROM / TO ----
    y = 128;
    doc.fontSize(9).fillColor('#888').text('FROM', 50, y);
    doc.fontSize(12).fillColor('#2c3e50').font('Helvetica').text(config.company.name, 50, y + 14);
    doc.fontSize(10).fillColor('#555').font('Helvetica').text(
      `${config.company.address}\n${config.company.phone}\n${config.company.email}`, 50, y + 31);

    doc.fontSize(9).fillColor('#888').text('TO', 310, y);
    doc.fontSize(12).fillColor('#2c3e50').font('Helvetica').text(config.client.name, 310, y + 14);
    doc.fontSize(10).fillColor('#555').font('Helvetica').text(config.client.address, 310, y + 31);

    // ---- DATES ----
    y = 245;
    doc.fontSize(8).fillColor('#888').text('INVOICE DATE', 50, y);
    doc.fontSize(11).fillColor('#333').font('Helvetica').text(data.invDate, 50, y + 12);
    doc.fontSize(8).fillColor('#888').text('TERMS', 50, y + 32);
    doc.fontSize(11).fillColor('#333').font('Helvetica').text('Custom', 50, y + 44);

    // Due Date right
    doc.fontSize(8).fillColor('#888').text('DUE DATE', 410, y);
    doc.fontSize(11).fillColor('#e74c3c').font('Helvetica').text(data.dueDate, 410, y + 12);

    // ---- TABLE HEADER ----
    y = 320;
    doc.rect(50, y, 495, 24).fillColor('#2c3e50').fill();
    doc.fillColor('#fff').fontSize(9).font('Helvetica');
    doc.text('#', 58, y + 7);
    doc.text('ITEM & DESCRIPTION', 85, y + 7);
    doc.text('AMOUNT', 530, y + 7, { align: 'right' });

    // ---- ITEM ROW ----
    y = 350;
    doc.fillColor('#f9f9f9');
    doc.rect(50, y, 495, 75).fill();
    doc.fillColor('#2c3e50').fontSize(11).font('Helvetica').text(config.invoice.itemName, 85, y + 10);
    doc.fillColor('#888').fontSize(9).font('Helvetica').text(
      config.invoice.description.replace('{MONTH}', data.mon).replace('{YEAR}', String(data.year)),
      85, y + 28);
    doc.fontSize(9).text(`IDR ${a} x 1.00`, 85, y + 42);
    doc.fillColor('#333').fontSize(10).font('Helvetica').text(`IDR ${a}`, 530, y + 10, { align: 'right' });

    // ---- SUB TOTAL / TOTAL ----
    y = 440;
    // Right-aligned block
    const lx = 330; // label x
    const vx = 530; // value x (max right)
    doc.fontSize(9).fillColor('#888').font('Helvetica').text('Sub Total', lx, y);
    doc.text(`IDR ${a}`, vx, y, { align: 'right' });

    doc.moveTo(lx, y + 16).lineTo(545, y + 16).strokeColor('#ddd').stroke();
    doc.fontSize(11).fillColor('#2c3e50').font('Helvetica').text('Total', lx, y + 22);
    doc.text(`IDR ${a}`, vx, y + 22, { align: 'right' });

    doc.moveTo(lx, y + 38).lineTo(545, y + 38).strokeColor('#e74c3c').stroke();
    doc.fontSize(10).fillColor('#e74c3c').font('Helvetica').text('Balance Due', lx, y + 44);
    doc.fontSize(12).fillColor('#e74c3c').font('Helvetica').text(`IDR ${a}`, vx, y + 43, { align: 'right' });

    // ---- PAYMENT ----
    y = 545;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke();
    doc.fontSize(10).fillColor('#2c3e50').font('Helvetica').text('Please make payment to:', 50, y + 10);
    doc.fontSize(9).fillColor('#555').font('Helvetica');
    const payLines = [
      `${config.payment.bank} (${config.payment.accountName})`,
      `Account No: ${config.payment.accountNumber}`,
      `SWIFT: ${config.payment.swiftCode}  Branch: ${config.payment.branchCode}  Bank Code: ${config.payment.bankCode}`,
      `Wise: ${config.payment.wise.email}  Phone: ${config.payment.wise.phone}`,
    ];
    payLines.forEach((l, i) => doc.text(l, 50, y + 28 + i * 14));

    // ---- FOOTER ----
    doc.fontSize(8).fillColor('#888').font('Helvetica').text(
      `Invoice# ${data.invStr}  |  Invoice Date ${data.invDate}  |  Generated by Jarvis`,
      50, 790, { align: 'center' }
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
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`,
                 'Content-Length': head.length + buf.length + tail.length },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { const j = JSON.parse(d); if (j.ok) resolve(j); else reject(new Error(j.description)); } catch(e) { reject(new Error(d)); } });
    });
    req.on('error', reject);
    req.write(head); req.write(buf); req.write(tail);
    req.end();
  });
}

module.exports = async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query?.year) || now.getFullYear();
    const month = parseInt(req.query?.month) || (now.getMonth() + 1);
    const data = generateInvoiceData(year, month);
    const pdf = await buildPdf(data);
    const fileName = `${data.invStr}.pdf`;
    const caption = `📄 *Invoice ${data.invStr}*\n${config.invoice.itemName} ${data.mon} ${data.year}\n💰 IDR ${fmt(data.amount)}\n📅 Due: ${data.dueDate}`;

    if (botToken && chatId && (req.headers['x-vercel-cron'] === '1' || (!req.query?.year && !req.query?.month))) {
      await sendToTelegram(pdf, fileName, caption);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
