const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'invoice-config.json'), 'utf8'));

async function generatePDF(year, month) {
  const generatorPath = path.join(__dirname, 'invoice-generator.js');
  
  // Run generator
  const { execSync } = require('child_process');
  const output = execSync(`node "${generatorPath}" ${year} ${month}`, { encoding: 'utf8' });

  console.log(output);

  // Parse meta JSON
  const metaMatch = output.match(/---META---\n([\s\S]+)/);
  if (!metaMatch) throw new Error('Could not find META in generator output');
  
  const meta = JSON.parse(metaMatch[1]);
  const htmlPath = meta.htmlPath;
  const pdfPath = path.join(path.dirname(htmlPath), meta.pdfFilename);

  // Convert HTML to PDF
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const html = fs.readFileSync(htmlPath, 'utf8');
  await page.setContent(html, { waitUntil: 'networkidle' });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
  });

  await browser.close();

  console.log(`PDF generated: ${pdfPath}`);
  return { pdfPath, meta };
}

// --- CLI ---
if (require.main === module) {
  const now = new Date();
  const year = parseInt(process.argv[2]) || now.getFullYear();
  const month = parseInt(process.argv[3]) || (now.getMonth() + 1);

  generatePDF(year, month)
    .then(({ pdfPath, meta }) => {
      console.log(`Done! PDF: ${pdfPath}`);
      console.log(`Invoice: ${meta.invoiceStr}`);
      console.log(`Date: ${meta.invoiceDate} | Due: ${meta.dueDate}`);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { generatePDF };
