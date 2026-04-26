// Standalone runner for scheduled task — calls the Vercel endpoint directly
// This avoids Chrome/Chromium dependency locally; uses Vercel API instead
const https = require('https');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'invoice-config.json'), 'utf8'));

const now = new Date();
const y = now.getFullYear();
const m = now.getMonth() + 1;

function fmt(n) {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const names = ['January','February','March','April','May','June',
               'July','August','September','October','November','December'];

const invUrl = `https://invoice-generator-puce-nine.vercel.app/api/generate?year=${y}&month=${m}`;

console.log(`⏳ Fetching invoice from Vercel: ${invUrl}`);

https.get(invUrl, (res) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    const contentType = res.headers['content-type'] || '';

    if (res.statusCode === 200 && contentType.includes('pdf')) {
      const outputDir = path.join(__dirname, 'output');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const pad = n => String(n).padStart(2, '0');
      const baseNum = config.invoice.startNumber;
      const offset = (y - 2026) * 12 + (m - 4);
      const fileName = `${config.invoice.prefix}${String(baseNum + offset).padStart(6, '0')}.pdf`;
      const filePath = path.join(outputDir, fileName);

      fs.writeFileSync(filePath, buf);
      console.log(`✅ PDF saved: ${filePath} (${buf.length} bytes)`);

      // Send to Telegram
      sendToTelegram(buf, fileName,
        `📄 *Invoice ${fileName.replace('.pdf', '')}*\n${config.invoice.itemName} ${names[m-1]} ${y}\n💰 IDR ${fmt(config.invoice.amount)}`
      );
    } else {
      const body = Buffer.concat(chunks).toString();
      console.error(`❌ Vercel returned ${res.statusCode}: ${body.substring(0, 200)}`);
    }
  });
}).on('error', err => {
  console.error('❌ Network error:', err.message);
});

function sendToTelegram(buf, fileName, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('❌ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return;
  }

  const boundary = '----' + Math.random().toString(36).slice(2);
  let body = '';
  body += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
  body += `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`;
  const head = Buffer.from(body, 'utf8');
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  const opts = {
    hostname: 'api.telegram.org', method: 'POST',
    path: `/bot${token}/sendDocument?chat_id=${chatId}`,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`,
               'Content-Length': head.length + buf.length + tail.length },
  };

  const req = https.request(opts, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try { const j = JSON.parse(d); console.log(j.ok ? '✅ Telegram OK' : `❌ Telegram: ${j.description}`); } catch(e) { console.error('❌ Telegram parse error'); }
    });
  });
  req.on('error', err => console.error('❌ Telegram send error:', err.message));
  req.write(head); req.write(buf); req.write(tail);
  req.end();
}
