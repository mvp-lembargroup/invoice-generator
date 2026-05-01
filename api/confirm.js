const fs = require('fs');
const path = require('path');
const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'invoice-config.json'), 'utf8')
);

const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

module.exports = async (req, res) => {
  const q = req.query || {};
  const now = new Date();
  const year = parseInt(q.year) || now.getFullYear();
  const month = parseInt(q.month) || (now.getMonth() + 1);

  const baseNum = config.invoice.startNumber;
  const offset = (year - 2026) * 12 + (month - 4);
  const invNum = baseNum + offset;
  const invStr = config.invoice.prefix + String(invNum).padStart(6, '0');
  const amount = config.invoice.amount.toLocaleString('id-ID');
  const clientName = config.client.name;
  const monthName = names[month-1];

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Konfirmasi Invoice</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; text-align: center; }
    h1 { color: #e74c3c; }
    .details { background: #f5f5f5; padding: 20px; margin: 20px 0; text-align: left; border-radius: 8px; }
    .btn { padding: 15px 30px; font-size: 18px; margin: 10px; cursor: pointer; border: none; border-radius: 5px; }
    .yes { background: #27ae60; color: white; }
    .no { background: #95a5a6; color: white; }
    a { text-decoration: none; }
  </style>
</head>
<body>
  <h1>Konfirmasi Kirim Invoice</h1>
  <div class="details">
    <p><strong>Invoice:</strong> ${invStr}</p>
    <p><strong>Bulan:</strong> ${monthName} ${year}</p>
    <p><strong>Client:</strong> ${clientName}</p>
    <p><strong>Amount:</strong> IDR ${amount}</p>
  </div>
  <p>Yakin ingin mengirim invoice ini ke Telegram & Email?</p>
  <form action="/api/generate" method="GET">
    <input type="hidden" name="year" value="${year}">
    <input type="hidden" name="month" value="${month}">
    <input type="hidden" name="confirm" value="true">
    <input type="hidden" name="cc" value="${config.delivery.cc || ''}">
    <button type="submit" class="btn yes">Ya, Kirim</button>
  </form>
  <a href="/"><button class="btn no">Batal</button></a>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.end(html);
};