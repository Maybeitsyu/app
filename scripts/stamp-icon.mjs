import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const exe = path.join(root, 'dist', 'packaged', 'win-unpacked', 'AgriLedger.exe');
const icon = path.join(root, 'logo', 'icon.ico');

try {
  // rcedit is installed by electron-builder already
  const rcedit = path.join(root, 'node_modules', 'rcedit', 'bin', 'rcedit.exe');
  execSync(`"${rcedit}" "${exe}" --set-icon "${icon}"`, { stdio: 'inherit' });
  console.log('✓ Icon stamped into AgriLedger.exe');
} catch (err) {
  console.error('rcedit failed:', err.message);
  console.log('Try running the terminal as Administrator and re-run: node scripts/stamp-icon.mjs');
}
