#!/usr/bin/env node
// invoice-runner.js - Called by cron on the 25th of each month
// Generates PDF, then sends via Telegram (and optionally email)

const path = require('path');
const fs = require('fs');

const { generatePDF } = require('./invoice-pdf');
const configPath = path.join(__dirname, 'invoice-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function main() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  console.log(`[${new Date().toISOString()}] Running invoice generation for ${month}/${year}...`);

  // 1. Generate PDF
  const { pdfPath, meta } = await generatePDF(year, month);
  console.log(`PDF ready: ${pdfPath}`);

  // 2. Send to Telegram
  if (config.delivery.telegram) {
    // We'll output a special line that OpenClaw can pick up
    console.log(`---SEND_TELEGRAM---`);
    console.log(JSON.stringify({
      type: 'document',
      filePath: pdfPath,
      caption: `📄 *Invoice ${meta.invoiceStr}*\n\nItem: ${config.invoice.itemName} ${meta.monthName} ${meta.year}\nAmount: IDR ${config.invoice.amount.toLocaleString('id-ID')}\nDue Date: ${meta.dueDate}\n\n🔗 *Payment*\nBank Mandiri (Asep Darmawansyah)\n1390010408031`
    }));
  }

  // 3. Send to Email
  if (config.delivery.email) {
    console.log(`---SEND_EMAIL---`);
    console.log(JSON.stringify({
      to: config.delivery.email,
      subject: `Invoice ${meta.invoiceStr} - ${config.invoice.itemName} ${meta.monthName} ${meta.year}`,
      body: `Dear Sleek EV Pte Ltd,\n\nPlease find attached invoice ${meta.invoiceStr} for ${config.invoice.itemName} ${meta.monthName} ${meta.year}.\n\nAmount: IDR ${config.invoice.amount.toLocaleString('id-ID')}\nDue Date: ${meta.dueDate}\n\nThank you.`,
      attachmentPath: pdfPath,
      attachmentName: `Invoice-${meta.invoiceStr}.pdf`
    }));
  }

  console.log(`[${new Date().toISOString()}] Invoice generation complete.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
