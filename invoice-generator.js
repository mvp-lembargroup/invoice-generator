// invoice-generator.js
// Run: node invoice-generator.js [year] [month]
// Example: node invoice-generator.js 2026 4  (for April 2026)
// If no args, uses current date

const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'invoice-config.json'), 'utf8'));

// --- Parse arguments ---
const now = new Date();
const year = parseInt(process.argv[2]) || now.getFullYear();
const month = parseInt(process.argv[3]) || (now.getMonth() + 1);

// --- Invoice number from config start + months since start ---
const baseNumber = config.invoice.startNumber; // 67 = LD-000067 for April 2026
const baseYear = 2026;
const baseMonth = 4;
const monthsSince = (year - baseYear) * 12 + (month - baseMonth);
const invoiceNum = baseNumber + monthsSince;
const invoiceStr = config.invoice.prefix + String(invoiceNum).padStart(6, '0');

// --- Dates ---
const pad = (n) => String(n).padStart(2, '0');
const invoiceDate = `${pad(25)}/${pad(month)}/${year}`;
// Due date = 1st of next month
const dueMonth = month === 12 ? 1 : month + 1;
const dueYear = month === 12 ? year + 1 : year;
const dueDate = `01/${pad(dueMonth)}/${dueYear}`;

// --- Month name ---
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = monthNames[month - 1];

// --- Format currency ---
const fmt = (n) => {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const amount = config.invoice.amount;

// --- Read template ---
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

for (const [key, val] of Object.entries(replacements)) {
  html = html.split(key).join(val);
}

// --- Output HTML ---
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const baseFilename = `${invoiceStr.replace('#', '').replace('/', '-')}`;
const htmlPath = path.join(outputDir, `${baseFilename}.html`);
fs.writeFileSync(htmlPath, html);

console.log(`HTML generated: ${htmlPath}`);
console.log(`PDF filename: ${baseFilename}.pdf`);
console.log(`Invoice: ${invoiceStr}`);
console.log(`Date: ${invoiceDate} | Due: ${dueDate}`);
console.log(`Item: ${config.invoice.itemName} ${monthName} ${year}`);
console.log(`Amount: IDR ${fmt(amount)}`);

// Output JSON for the runner script
console.log(`---META---`);
console.log(JSON.stringify({
  invoiceStr,
  invoiceDate,
  dueDate,
  monthName,
  year,
  htmlPath,
  pdfFilename: `${baseFilename}.pdf`
}));
