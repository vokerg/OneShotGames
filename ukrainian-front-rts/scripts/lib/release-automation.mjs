import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { buildReleasePackage, verifyReleasePackage } from './release-package.mjs';

export const RELEASE_ARTIFACT_SCHEMA = 'fields-of-resolve.release-artifact';
export const RELEASE_ARTIFACT_VERSION = 1;
export const RELEASE_METADATA_PATH = 'release-metadata.json';
export const RELEASE_NOTES_PATH = 'release-notes.md';
export const RELEASE_ARTIFACT_MANIFEST_PATH = 'artifact-manifest.json';
export const RELEASE_CHECKSUMS_PATH = 'SHA256SUMS';
export const RELEASE_PACKAGE_DIRECTORY = 'package';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const REQUIRED_RELEASE_NOTE_HEADINGS = Object.freeze(['## Highlights', '## Verification', '## Known issues', '## Rollback']);

function posix(path) {
  return path.replaceAll(sep, '/');
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function walkFiles(root) {
  const output = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) output.push(posix(relative(root, absolute)));
      else throw new Error(`Release artifact does not support non-file entry: ${posix(relative(root, absolute))}`);
    }
  }
  await walk(root);
  return output.sort();
}

function ensureSafeRelativePath(path) {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new Error(`Unsafe release artifact path: ${path}`);
  }
  return path;
}

export function validateProductVersion(version) {
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    throw new Error(`Release version must be SemVer (for example 1.2.3 or 1.2.3-rc.1): ${version}`);
  }
  return version;
}

export function validateChangelog(changelog, version) {
  validateProductVersion(version);
  if (typeof changelog !== 'string' || !changelog.includes('# Changelog')) {
    throw new Error('CHANGELOG.md must contain a top-level Changelog heading.');
  }
  const escaped = version.replaceAll('.', '\\.').replaceAll('+', '\\+');
  const heading = new RegExp(`^## \\[${escaped}\\](?: - \\d{4}-\\d{2}-\\d{2})?$`, 'm');
  if (!heading.test(changelog)) throw new Error(`CHANGELOG.md is missing a release heading for ${version}.`);
  return true;
}

export function validateReleaseNotes(notes, version) {
  validateProductVersion(version);
  if (typeof notes !== 'string' || !notes.trim()) throw new Error('Release notes must not be empty.');
  const firstHeading = notes.split(/\r?\n/, 1)[0].trim();
  if (firstHeading !== `# Fields of Resolve ${version}`) {
    throw new Error(`Release notes must start with "# Fields of Resolve ${version}".`);
  }
  for (const heading of REQUIRED_RELEASE_NOTE_HEADINGS) {
    if (!notes.includes(heading)) throw new Error(`Release notes are missing required heading: ${heading}`);
  }
  if (/<[^>\r\n]+>/.test(notes) || /\b(?:TODO|TBD)\b/.test(notes)) {
    throw new Error('Release notes still contain template placeholders.');
  }
  return true;
}

export function parseChecksums(source) {
  const entries = new Map();
  for (const line of String(source).split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Malformed checksum line: ${line}`);
    const path = ensureSafeRelativePath(match[2]);
    if (entries.has(path)) throw new Error(`Duplicate checksum path: ${path}`);
    entries.set(path, match[1]);
  }
  return entries;
}

async function inventory(root, paths) {
  const entries = [];
  for (const path of [...paths].sort()) {
    ensureSafeRelativePath(path);
    const content = await readFile(join(root, path));
    entries.push(Object.freeze({ path, bytes: content.byteLength, sha256: sha256(content) }));
  }
  return Object.freeze(entries);
}

function formatChecksums(entries) {
  return `${entries.map(({ sha256: digest, path }) => `${digest}  ${path}`).join('\n')}\n`;
}

function outputOverlapsProject(projectRoot, outputRoot) {
  const project = resolve(projectRoot);
  const output = resolve(outputRoot);
  return output === project || project.startsWith(`${output}${sep}`) || output.startsWith(`${project}${sep}`);
}

export async function buildReleaseArtifact({ projectRoot, outputRoot, version, notesPath }) {
  if (!projectRoot || !outputRoot || !version || !notesPath) {
    throw new TypeError('buildReleaseArtifact requires projectRoot, outputRoot, version, and notesPath.');
  }
  const root = resolve(projectRoot);
  const output = resolve(outputRoot);
  validateProductVersion(version);
  if (outputOverlapsProject(root, output)) throw new Error('Release artifact output must be outside the project tree.');

  const [changelog, notes] = await Promise.all([
    readFile(join(root, 'CHANGELOG.md'), 'utf8'),
    readFile(resolve(notesPath), 'utf8'),
  ]);
  validateChangelog(changelog, version);
  validateReleaseNotes(notes, version);

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const packageRoot = join(output, RELEASE_PACKAGE_DIRECTORY);
  const packageManifest = await buildReleasePackage({ projectRoot: root, outputRoot: packageRoot });

  await writeFile(join(output, RELEASE_NOTES_PATH), notes.endsWith('\n') ? notes : `${notes}\n`);
  await writeFile(join(output, RELEASE_METADATA_PATH), `${JSON.stringify({
    schema: RELEASE_ARTIFACT_SCHEMA,
    version: RELEASE_ARTIFACT_VERSION,
    product: 'Fields of Resolve',
    productVersion: version,
    releaseId: packageManifest.releaseId,
    packageDirectory: RELEASE_PACKAGE_DIRECTORY,
    packageManifest: `${RELEASE_PACKAGE_DIRECTORY}/release-manifest.json`,
    entrypoint: `${RELEASE_PACKAGE_DIRECTORY}/index.html`,
    releaseNotes: RELEASE_NOTES_PATH,
  }, null, 2)}\n`);

  const payloadPaths = (await walkFiles(output)).filter((path) => path !== RELEASE_ARTIFACT_MANIFEST_PATH && path !== RELEASE_CHECKSUMS_PATH);
  const files = await inventory(output, payloadPaths);
  const artifactManifest = {
    schema: RELEASE_ARTIFACT_SCHEMA,
    version: RELEASE_ARTIFACT_VERSION,
    productVersion: version,
    releaseId: packageManifest.releaseId,
    files,
  };
  await writeFile(join(output, RELEASE_ARTIFACT_MANIFEST_PATH), `${JSON.stringify(artifactManifest, null, 2)}\n`);
  const checksumEntries = await inventory(output, [...payloadPaths, RELEASE_ARTIFACT_MANIFEST_PATH]);
  await writeFile(join(output, RELEASE_CHECKSUMS_PATH), formatChecksums(checksumEntries));
  return Object.freeze(artifactManifest);
}

export async function verifyReleaseArtifact(outputRoot, { expectedVersion = null } = {}) {
  const output = resolve(outputRoot);
  const manifest = JSON.parse(await readFile(join(output, RELEASE_ARTIFACT_MANIFEST_PATH), 'utf8'));
  if (manifest.schema !== RELEASE_ARTIFACT_SCHEMA || manifest.version !== RELEASE_ARTIFACT_VERSION) {
    throw new Error(`Unsupported release artifact manifest ${manifest.schema}@${manifest.version}.`);
  }
  validateProductVersion(manifest.productVersion);
  if (expectedVersion && manifest.productVersion !== expectedVersion) {
    throw new Error(`Release artifact version mismatch: expected ${expectedVersion}, found ${manifest.productVersion}.`);
  }

  const metadata = JSON.parse(await readFile(join(output, RELEASE_METADATA_PATH), 'utf8'));
  if (metadata.schema !== RELEASE_ARTIFACT_SCHEMA || metadata.version !== RELEASE_ARTIFACT_VERSION) {
    throw new Error('Release metadata schema/version does not match the artifact contract.');
  }
  if (metadata.productVersion !== manifest.productVersion || metadata.releaseId !== manifest.releaseId) {
    throw new Error('Release metadata does not match the artifact manifest.');
  }

  const packageResult = await verifyReleasePackage(join(output, RELEASE_PACKAGE_DIRECTORY));
  if (packageResult.releaseId !== manifest.releaseId) throw new Error('Packaged release ID does not match the outer artifact manifest.');

  const declared = new Map((manifest.files ?? []).map((entry) => [ensureSafeRelativePath(entry.path), entry]));
  const actual = (await walkFiles(output)).filter((path) => path !== RELEASE_ARTIFACT_MANIFEST_PATH && path !== RELEASE_CHECKSUMS_PATH);
  if (JSON.stringify([...declared.keys()].sort()) !== JSON.stringify(actual.sort())) {
    throw new Error('Release artifact file set drifted from artifact-manifest.json.');
  }
  for (const [path, entry] of declared) {
    const content = await readFile(join(output, path));
    if (content.byteLength !== entry.bytes || sha256(content) !== entry.sha256) throw new Error(`Release artifact digest mismatch: ${path}`);
  }

  const checksumEntries = parseChecksums(await readFile(join(output, RELEASE_CHECKSUMS_PATH), 'utf8'));
  const checksumTargets = [...actual, RELEASE_ARTIFACT_MANIFEST_PATH].sort();
  if (JSON.stringify([...checksumEntries.keys()].sort()) !== JSON.stringify(checksumTargets)) {
    throw new Error('SHA256SUMS does not cover the complete release artifact payload.');
  }
  for (const path of checksumTargets) {
    const content = await readFile(join(output, path));
    if (checksumEntries.get(path) !== sha256(content)) throw new Error(`SHA256SUMS mismatch: ${path}`);
  }

  const notes = await readFile(join(output, RELEASE_NOTES_PATH), 'utf8');
  validateReleaseNotes(notes, manifest.productVersion);
  return Object.freeze({ productVersion: manifest.productVersion, releaseId: manifest.releaseId, files: declared.size, checksums: checksumEntries.size });
}
