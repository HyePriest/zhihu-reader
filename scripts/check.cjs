const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = require('../package.json');
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version, 'Keep package and extension versions in sync');
assert.equal(pkg.license, 'GPL-3.0-only');
assert.deepEqual(manifest.permissions, ['scripting', 'activeTab']);
assert.deepEqual(manifest.host_permissions, ['https://www.zhihu.com/*']);
for (const file of ['background.js', 'extract.js', 'shared.js', 'reader.js', 'scripts/check.cjs']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
}
const html = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, match[1])), `Missing asset: ${match[1]}`);
assert.ok(fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').includes('Version 3, 29 June 2007'));
console.log(`Manifest, local assets, version ${manifest.version}, license and JavaScript syntax OK.`);
