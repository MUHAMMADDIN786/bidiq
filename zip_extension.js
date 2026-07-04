const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const extensionDir = path.join(__dirname, 'extension');
const zipFile = path.join(__dirname, 'bidiq-extension.zip');

console.log('📦 Starting BidIQ Extension packaging...');

// Verify critical files exist before zipping
const criticalFiles = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'popup.css',
  'content.js',
  'background.js',
  'styles.css',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

let missing = false;
criticalFiles.forEach(file => {
  const p = path.join(extensionDir, file);
  if (!fs.existsSync(p)) {
    console.error(`❌ Error: Missing required file: ${file}`);
    missing = true;
  }
});

if (missing) {
  console.error('❌ Packaging aborted due to missing files.');
  process.exit(1);
}

console.log('✅ All critical extension files verified.');

// Clean up old zip file if exists
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

// Run macOS native zip command (excluding DS_Store and test mock pages)
const cmd = `zip -r "${zipFile}" . -x "*.DS_Store" "*mock_upwork_page.html"`;
console.log(`🚀 Packaging files: ${cmd}`);

exec(cmd, { cwd: extensionDir }, (err, stdout, stderr) => {
  if (err) {
    console.error('❌ Failed to package extension:', err);
    process.exit(1);
  }
  
  console.log(`==================================================`);
  console.log(`🎉 BidIQ Extension packaged successfully!`);
  console.log(`📦 Archive location: ${zipFile}`);
  console.log(`==================================================`);
});
