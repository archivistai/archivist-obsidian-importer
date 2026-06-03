// Checks that package.json, manifest.json, versions.json, and CHANGELOG.md
// are all consistent with each other for the current version before a release.
const { readFileSync } = require('fs');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
const changelog = readFileSync('CHANGELOG.md', 'utf8');

const version = pkg.version;
const errors = [];

if (manifest.version !== version) {
    errors.push(`manifest.json version (${manifest.version}) does not match package.json (${version})`);
}

if (!Object.prototype.hasOwnProperty.call(versions, version)) {
    errors.push(`versions.json is missing an entry for ${version}`);
}

if (!changelog.includes(`## ${version}`)) {
    errors.push(`CHANGELOG.md has no entry for ## ${version}`);
}

if (errors.length > 0) {
    console.error('Release validation failed:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
}

console.log(`Release validation passed for ${version}`);
