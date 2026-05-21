const { app } = require('electron');
const path = require('path');
app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'data');
  console.log('DB_PATH:', dbPath);
  app.quit();
});
