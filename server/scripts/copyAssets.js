const fs = require('fs');
const path = require('path');

// Determine base server directory whether script is run from repo root or server/
const serverDir = fs.existsSync(path.resolve(__dirname, '../package.json'))
  ? path.resolve(__dirname, '..')
  : path.resolve(process.cwd(), 'server');

const distDir = path.resolve(serverDir, 'dist');
const distDataDir = path.resolve(distDir, 'data');
const distModelsDir = path.resolve(distDir, 'models');

console.log('[BUILD-ASSETS] Preparing production runtime asset directories...');
fs.mkdirSync(distDataDir, { recursive: true });
fs.mkdirSync(distModelsDir, { recursive: true });

// 1. Copy Authoritative Mumbai GeoJSON boundary dataset
const geojsonSourceCandidates = [
  path.resolve(serverDir, 'src/data/mumbai_bmc_wards.geojson'),
  path.resolve(process.cwd(), 'src/data/mumbai_bmc_wards.geojson'),
  path.resolve(process.cwd(), 'server/src/data/mumbai_bmc_wards.geojson'),
];

let geojsonSource = geojsonSourceCandidates.find(p => fs.existsSync(p));
if (geojsonSource) {
  const dest = path.resolve(distDataDir, 'mumbai_bmc_wards.geojson');
  fs.copyFileSync(geojsonSource, dest);
  console.log(`[BUILD-ASSETS] ✅ GeoJSON copied to: ${dest}`);
} else {
  console.warn('[BUILD-ASSETS] ⚠️ Warning: mumbai_bmc_wards.geojson source not found in candidate paths.');
}

// 2. Copy Computer Vision ONNX Models & Configs
const modelsSourceCandidates = [
  path.resolve(serverDir, 'models'),
  path.resolve(process.cwd(), 'models'),
  path.resolve(process.cwd(), 'server/models'),
];

let modelsSource = modelsSourceCandidates.find(p => fs.existsSync(p));
if (modelsSource) {
  const files = fs.readdirSync(modelsSource);
  let count = 0;
  for (const file of files) {
    const srcFile = path.resolve(modelsSource, file);
    const destFile = path.resolve(distModelsDir, file);
    if (fs.statSync(srcFile).isFile()) {
      fs.copyFileSync(srcFile, destFile);
      count++;
    }
  }
  console.log(`[BUILD-ASSETS] ✅ Copied ${count} AI model/config files to: ${distModelsDir}`);
} else {
  console.warn('[BUILD-ASSETS] ⚠️ Warning: models source directory not found in candidate paths.');
}

console.log('[BUILD-ASSETS] Asset staging completed successfully.');

