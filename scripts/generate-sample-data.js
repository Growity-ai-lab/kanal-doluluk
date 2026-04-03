const XLSX = require('xlsx');

// Create data
const data = [];
const channels = ['KANAL1', 'KANAL2', 'KANAL3', 'KANAL4', 'KANAL5', 'KANAL6', 'KANAL7', 'KANAL8'];
const categories = ['Haberler', 'Eglence', 'Spor', 'Sinema', 'Belgesel', 'Egitim'];

// Header
data.push(['Tarih', 'Kanal', 'Doluluk %', 'Puan', 'Kategori']);

// Generate 100 days of data
const baseDate = new Date();
for (let i = 0; i < 100; i++) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() - i);
  const dateStr = date.toISOString().split('T')[0];
  
  for (const channel of channels) {
    const occupancy = Math.floor(Math.random() * 91) + 10;
    const score = (occupancy / 20).toFixed(1);
    const category = categories[Math.floor(Math.random() * categories.length)];
    data.push([dateStr, channel, occupancy, score, category]);
  }
}

// Create workbook
const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Kanal Doluluk');

// Save
const outputPath = 'public/data/kanal-doluluk.xlsx';
XLSX.writeFile(wb, outputPath);
console.log('Excel file created successfully');
