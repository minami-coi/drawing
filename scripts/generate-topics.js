// Run from the repository root with: node scripts/generate-topics.js
// Rebuilds app/topics.json from every PNG directly inside app/images/.
const fs = require('node:fs');
const path = require('node:path');

const appDirectory = path.join(__dirname, '..', 'app');
const imageDirectory = path.join(appDirectory, 'images');
const topicFiles = fs.readdirSync(imageDirectory)
  .filter((file) => path.extname(file).toLowerCase() === '.png')
  .sort((a, b) => a.localeCompare(b, 'en'));

if (topicFiles.length === 0) {
  throw new Error('images/ にPNG画像がありません。');
}

fs.writeFileSync(path.join(appDirectory, 'topics.json'), `${JSON.stringify(topicFiles, null, 2)}\n`);
console.log(`${topicFiles.length}件の題材を app/topics.json に出力しました。`);
