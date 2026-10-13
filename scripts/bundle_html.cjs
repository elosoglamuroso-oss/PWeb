const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Run vite build
console.log('Building project with Vite...');
execSync('npx vite build', { stdio: 'inherit' });

// 2. Read dist files
const distDir = path.resolve(__dirname, '../dist');
const htmlPath = path.join(distDir, 'index.html');
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Find assets
const assetsDir = path.join(distDir, 'assets');
const assetFiles = fs.readdirSync(assetsDir);

const cssFile = assetFiles.find((f) => f.endsWith('.css'));
const jsFile = assetFiles.find((f) => f.endsWith('.js'));

if (cssFile) {
  const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
  // Replace <link rel="stylesheet" ...> with <style>...</style>
  htmlContent = htmlContent.replace(
    /<link[^>]+rel="stylesheet"[^>]*>/i,
    `<style>\n${cssContent}\n</style>`
  );
}

if (jsFile) {
  let jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
  // Escape closing script tags inside JS string literals if any
  jsContent = jsContent.replace(/<\/script>/gi, '<\\/script>');
  // Replace <script type="module" crossorigin src="..."></script> with inline script
  htmlContent = htmlContent.replace(
    /<script[^>]+type="module"[^>]*><\/script>/i,
    `<script type="module">\n${jsContent}\n</script>`
  );
}

// Ensure public directory exists
const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const outputPath = path.join(publicDir, 'PrestoWeb_App_Completo.html');
fs.writeFileSync(outputPath, htmlContent, 'utf8');
console.log(`Successfully generated standalone HTML at: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
