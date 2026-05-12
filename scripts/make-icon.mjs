import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

pngToIco(path.join(root, 'logo', 'logo.png'))
  .then((buf) => {
    const outPath = path.join(root, 'logo', 'icon.ico');
    fs.writeFileSync(outPath, buf);
    console.log('✓ Created logo/icon.ico');
  })
  .catch(console.error);
