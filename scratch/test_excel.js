import ExcelJS from 'exceljs';
import fs from 'fs';

async function test() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('test');
  
  // write 1x1 png image
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const imageId = wb.addImage({
    base64: base64Image,
    extension: 'png',
  });
  ws.addImage(imageId, {
    tl: { col: 1, row: 1 },
    ext: { width: 50, height: 50 }
  });
  
  await wb.xlsx.writeFile('test.xlsx');
  
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile('test.xlsx');
  const ws2 = wb2.getWorksheet('test');
  console.log('Images:', ws2.getImages());
  const img2 = wb2.getImage(ws2.getImages()[0].imageId);
  console.log('Image Data:', !!img2.buffer, img2.extension);
}

test().catch(console.error);
