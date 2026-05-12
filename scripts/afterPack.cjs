const { rcedit } = require('rcedit');
const path = require('path');

exports.default = async function(context) {
  if (context.electronPlatformName === 'win32') {
    const exePath = path.join(context.appOutDir, 'AgriLedger.exe');
    try {
      await rcedit(exePath, {
        icon: path.join(context.packager.projectDir, 'logo/icon.ico')
      });
      console.log('  • custom icon embedded into exe via afterPack hook');
    } catch (err) {
      console.error('  • failed to embed icon:', err);
    }
  }
};
