const fs = require('fs');
const path = require('path');

const mapPath = 'c:/projct ni client/app/dist/renderer/assets/index-BlQ8bl-Z.js.map';
const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

const appJsxIndex = mapData.sources.findIndex(s => s.endsWith('App.jsx'));

if (appJsxIndex !== -1) {
    const content = mapData.sourcesContent[appJsxIndex];
    fs.writeFileSync('c:/projct ni client/app/src/renderer/App.jsx', content);
    console.log('App.jsx restored successfully!');
} else {
    console.error('App.jsx not found in source map.');
}
