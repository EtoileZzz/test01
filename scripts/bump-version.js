import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkgPath = path.join(rootDir, 'package.json');
const gradlePath = path.join(rootDir, 'android/app/build.gradle');
const typesPath = path.join(rootDir, 'src/models/types.ts');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;
const type = process.argv[2] || 'patch'; // 'patch' | 'minor' | 'major'

const parts = currentVersion.split('.').map(n => parseInt(n, 10));
if (type === 'major') {
  parts[0]++;
  parts[1] = 0;
  parts[2] = 0;
} else if (type === 'minor') {
  parts[1]++;
  parts[2] = 0;
} else {
  parts[2]++;
}

const newVersion = parts.join('.');
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updated package.json: ${currentVersion} -> ${newVersion}`);

// Update build.gradle
let gradle = fs.readFileSync(gradlePath, 'utf8');
const codeMatch = gradle.match(/versionCode\s+(\d+)/);
let nextCode = 1;
if (codeMatch) {
  nextCode = parseInt(codeMatch[1], 10) + 1;
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
}
gradle = gradle.replace(/versionName\s+["'][^"']+["']/, `versionName "${newVersion}"`);
fs.writeFileSync(gradlePath, gradle);
console.log(`Updated android/app/build.gradle: versionCode ${nextCode}, versionName "${newVersion}"`);

// Update types.ts
let types = fs.readFileSync(typesPath, 'utf8');
types = types.replace(/export const APP_VERSION = '[^']+';/, `export const APP_VERSION = '${newVersion}';`);
types = types.replace(/export const APP_BUILD = \d+;/, `export const APP_BUILD = ${nextCode};`);
fs.writeFileSync(typesPath, types);
console.log(`Updated src/models/types.ts: APP_VERSION = '${newVersion}', APP_BUILD = ${nextCode}`);
