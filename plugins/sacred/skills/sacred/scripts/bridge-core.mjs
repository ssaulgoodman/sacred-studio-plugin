import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

export const BRIDGE_VERSION = '1';
export const DEFAULT_API_URL = 'https://app.sacredai.studio';
export const SYNC_PROFILES = new Set(['full', 'state', 'payloads']);
export const ASSET_PURPOSES = new Set([
  'style_guide',
  'style_reference',
  'cast_guide',
  'cast_reference',
  'env_guide',
  'env_reference',
  'storyboard_image',
  'keyframe_image',
  'audio_source',
  'composition_bundle',
  'media',
]);

const STATE_FILE = '.sync-state.json';
const WORKSPACE_STATE_FILE = '.mirage-workspace-state.json';
const LOCK_DIR = '.sync-state.lock';
const WORKSPACE_LOCK_DIR = '.mirage-workspace-state.lock';
const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000;
const MAX_TOKEN_BYTES = 4096;
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const WRITE_POLICIES = new Set(['overwrite', 'review_before_overwrite', 'create_if_missing']);

export class BridgeFailure extends Error {
  constructor(code, message, details = undefined, exitCode = 1) {
    super(message);
    this.name = 'BridgeFailure';
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}

const fail = (code, message, details = undefined, exitCode = 1) => {
  throw new BridgeFailure(code, message, details, exitCode);
};

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const normalizeBaseUrl = (value = DEFAULT_API_URL) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('invalid_base_url', 'Sacred base URL must be an absolute HTTP(S) URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    fail('invalid_base_url', 'Sacred base URL must use HTTP or HTTPS.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail('invalid_base_url', 'Sacred base URL cannot contain credentials, query values, or a fragment.');
  }
  return parsed.href.replace(/\/+$/, '');
};

export const normalizeSyncProfile = (value) => {
  if (!SYNC_PROFILES.has(value)) {
    fail('invalid_sync_profile', 'Sync profile must be full, state, or payloads.');
  }
  return value;
};

const normalizeProjectId = (value) => {
  const projectId = String(value || '').trim();
  if (!PROJECT_ID_PATTERN.test(projectId) || projectId === '.' || projectId === '..') {
    fail('invalid_project_id', 'Project id contains unsupported characters.');
  }
  return projectId;
};

const normalizeToken = (value) => {
  const token = String(value || '').trim();
  if (!token) fail('auth_missing', 'A Sacred project token is required on stdin.', undefined, 2);
  if (Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES || /[\r\n\0]/.test(token)) {
    fail('invalid_token', 'The stdin token is malformed.', undefined, 2);
  }
  return token;
};

export const readTokenFromStdin = async (input = process.stdin) => {
  if (input.isTTY) fail('auth_missing', 'A Sacred project token is required on stdin.', undefined, 2);
  const chunks = [];
  let total = 0;
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_TOKEN_BYTES) fail('invalid_token', 'The stdin token is malformed.', undefined, 2);
    chunks.push(buffer);
  }
  return normalizeToken(Buffer.concat(chunks).toString('utf8'));
};

const readJson = (filePath, fallback) => {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
};

const pathExists = (filePath) => {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const ensureDirectoryPath = (rootReal, directoryPath) => {
  const relative = path.relative(rootReal, directoryPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('unsafe_path', 'Notebook path escapes the workspace.');
  }
  let current = rootReal;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!pathExists(current)) fs.mkdirSync(current);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail('unsafe_path', 'Notebook path crosses a symlink or non-directory component.');
    }
    const real = fs.realpathSync(current);
    if (real !== current) fail('unsafe_path', 'Notebook path crosses a redirected directory.');
  }
};

export const resolveWorkspaceRoot = (workspace) => {
  const requested = path.resolve(workspace || process.cwd());
  fs.mkdirSync(requested, { recursive: true });
  return fs.realpathSync(requested);
};

export const safeWorkspacePath = (workspaceRoot, relativePath, opts = {}) => {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\0')
    || relativePath.includes('\\') || path.posix.isAbsolute(relativePath)) {
    fail('unsafe_path', 'Server manifest contains an unsafe notebook path.');
  }
  const normalized = path.posix.normalize(relativePath);
  if (normalized !== relativePath || normalized === '..' || normalized.startsWith('../')) {
    fail('unsafe_path', 'Server manifest path escapes the workspace.');
  }
  if (opts.projectId) {
    const prefix = `mirage/projects/${opts.projectId}/`;
    if (!relativePath.startsWith(prefix)) {
      fail('unsafe_path', 'Server project manifest path escapes the project root.');
    }
  }
  const absolutePath = path.join(workspaceRoot, ...relativePath.split('/'));
  const relative = path.relative(workspaceRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('unsafe_path', 'Server manifest path escapes the workspace.');
  }
  let current = workspaceRoot;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!pathExists(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) {
      fail('unsafe_path', 'Notebook path crosses a symlink.');
    }
  }
  return absolutePath;
};

export const atomicWriteFile = (filePath, content, expectedHash = null, hooks = {}) => {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  if (expectedHash && sha256(buffer) !== expectedHash) {
    fail('hash_mismatch', 'Notebook content did not match its manifest hash.');
  }
  const workspaceRoot = hooks.workspaceRoot || fs.realpathSync(path.dirname(filePath));
  ensureDirectoryPath(workspaceRoot, path.dirname(filePath));
  if (pathExists(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
    fail('unsafe_path', 'Notebook destination is a symlink.');
  }
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, buffer);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (sha256(fs.readFileSync(tempPath)) !== sha256(buffer)) {
      fail('hash_mismatch', 'Atomic notebook write failed hash verification.');
    }
    hooks.beforeRename?.({ tempPath, filePath });
    if (pathExists(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
      fail('unsafe_path', 'Notebook destination became a symlink before commit.');
    }
    const parentReal = fs.realpathSync(path.dirname(filePath));
    if (parentReal !== path.dirname(filePath)) {
      fail('unsafe_path', 'Notebook destination directory changed before commit.');
    }
    fs.renameSync(tempPath, filePath);
    try {
      const directory = fs.openSync(path.dirname(filePath), 'r');
      fs.fsyncSync(directory);
      fs.closeSync(directory);
    } catch {
      // Directory fsync is unavailable on some supported filesystems.
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* preserve the original failure */ }
    }
    try { fs.unlinkSync(tempPath); } catch { /* temp may not exist */ }
    throw error;
  }
};

const pidStatus = (pid) => {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return 'unknown';
  try {
    process.kill(value, 0);
    return 'alive';
  } catch (error) {
    if (error?.code === 'ESRCH') return 'dead';
    if (error?.code === 'EPERM') return 'alive';
    return 'unknown';
  }
};

const lockTtl = (value) => {
  const parsed = Number(value || DEFAULT_LOCK_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOCK_TTL_MS;
};

export const describeSyncLock = (lockPath, ttlMs = DEFAULT_LOCK_TTL_MS) => {
  if (!pathExists(lockPath)) return { present: false, state: 'clear', path: lockPath };
  let stat = null;
  try { stat = fs.statSync(lockPath); } catch { /* report unknown below */ }
  const owner = readJson(path.join(lockPath, 'owner.json'), null);
  const createdAt = owner?.createdAt || stat?.mtime?.toISOString?.() || null;
  const createdMs = createdAt ? Date.parse(createdAt) : NaN;
  const ageMs = Number.isFinite(createdMs) ? Date.now() - createdMs : null;
  const ownerPidStatus = pidStatus(owner?.pid);
  const limit = lockTtl(ttlMs);
  const staleReason = ownerPidStatus === 'dead'
    ? 'dead_pid'
    : ownerPidStatus !== 'alive' && ageMs != null && ageMs > limit
      ? 'ttl_expired'
      : null;
  const state = ownerPidStatus === 'alive'
    ? 'active'
    : ownerPidStatus === 'dead'
      ? 'stale'
      : 'unknown';
  return {
    present: true,
    state,
    staleReason,
    ownerPidStatus,
    ageMs,
    lockTtlMs: limit,
    owner: owner ? {
      pid: owner.pid,
      createdAt: owner.createdAt,
      ownerId: owner.ownerId,
      scope: owner.scope,
    } : null,
    path: lockPath,
  };
};

const safeTimestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const acquireSyncLock = (workspaceRoot, lockPath, opts = {}) => {
  ensureDirectoryPath(workspaceRoot, path.dirname(lockPath));
  let previous = null;
  try {
    fs.mkdirSync(lockPath);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const description = describeSyncLock(lockPath, opts.lockTtlMs);
    const recoverable = description.state === 'stale'
      || (description.state === 'unknown' && opts.recoverLock === true);
    if (!recoverable) {
      const code = description.state === 'unknown' ? 'sync_lock_unknown' : 'sync_already_running';
      fail(code, description.state === 'unknown'
        ? `The ${opts.scope || 'project'} sync lock owner is unknown; inspect it or use --recover-lock explicitly.`
        : `Another Sacred sync appears active for this ${opts.scope || 'project'}.`, {
        state: description.state,
        staleReason: description.staleReason,
        ownerPidStatus: description.ownerPidStatus,
        lockTtlMs: description.lockTtlMs,
      }, 4);
    }
    const suffix = `${description.state}-${safeTimestamp()}-${process.pid}`;
    const movedTo = `${lockPath}.${suffix}`;
    fs.renameSync(lockPath, movedTo);
    previous = { movedTo, state: description.state, staleReason: description.staleReason };
    try {
      fs.mkdirSync(lockPath);
    } catch (retryError) {
      if (retryError?.code === 'EEXIST') {
        fail('sync_already_running', 'Another Sacred sync acquired the lock during recovery.', undefined, 4);
      }
      throw retryError;
    }
  }
  const ownerId = crypto.randomUUID();
  const owner = {
    ownerId,
    pid: process.pid,
    createdAt: new Date().toISOString(),
    bridgeVersion: BRIDGE_VERSION,
    scope: opts.scope || 'project',
    previous,
  };
  atomicWriteFile(path.join(lockPath, 'owner.json'), `${JSON.stringify(owner, null, 2)}\n`, null, {
    workspaceRoot,
  });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = readJson(path.join(lockPath, 'owner.json'), null);
    if (current?.ownerId === ownerId) fs.rmSync(lockPath, { recursive: true, force: true });
  };
};

const pathMatchesSyncProfile = (projectId, profile, relativePath) => {
  const baseDir = `mirage/projects/${projectId}`;
  if (!relativePath.startsWith(`${baseDir}/`)) return false;
  if (profile === 'full') return true;
  if (relativePath === `${baseDir}/notebook.json`) return true;
  if (profile === 'payloads') return relativePath.startsWith(`${baseDir}/state/payloads/`);
  return profile === 'state' && relativePath.startsWith(`${baseDir}/state/`);
};

const requestJson = async (url, options, token, fetchImpl) => {
  let response;
  try {
    response = await fetchImpl(url, { ...options, redirect: 'error' });
  } catch {
    fail('network_failed', 'Sacred could not be reached.');
  }
  const json = await response.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    fail('invalid_response', `Sacred returned a non-JSON response with HTTP ${response.status}.`, { status: response.status });
  }
  if (!response.ok || json.ok === false) {
    const serverError = json.error && typeof json.error === 'object' ? json.error : typeof json.message === 'string' ? json : {};
    const rawMessage = typeof serverError.message === 'string' ? serverError.message : 'Sacred request failed.';
    const message = rawMessage.includes(token) ? 'Sacred request failed.' : rawMessage.slice(0, 500);
    fail(typeof serverError.code === 'string' ? serverError.code : 'request_failed', message, {
      status: response.status,
      requestId: typeof serverError.requestId === 'string' ? serverError.requestId : undefined,
      retryAfter: response.headers.get('retry-after') || undefined,
      assetId: typeof serverError.details?.assetId === 'string' ? serverError.details.assetId : undefined,
    }, response.status === 401 ? 2 : 1);
  }
  return { data: json.data ?? json, response };
};

const validateRemoteNotebook = (remote, projectId, profile, workspaceRoot) => {
  if (!remote || remote.kind !== 'mirage.notebook.sync' || remote.syncProfile !== profile
    || !Array.isArray(remote.manifest) || !Array.isArray(remote.files)
    || !Array.isArray(remote.removedFiles)) {
    fail('invalid_response', 'Sacred returned an invalid notebook sync receipt.');
  }
  const manifestByPath = new Map();
  for (const entry of remote.manifest) {
    if (!entry || typeof entry.path !== 'string') fail('invalid_response', 'Notebook manifest entry is invalid.');
    safeWorkspacePath(workspaceRoot, entry.path, (entry.scope || 'project') === 'project' ? { projectId } : {});
    if (manifestByPath.has(entry.path) || !HASH_PATTERN.test(entry.hash)
      || !Number.isInteger(entry.size) || entry.size < 0 || !WRITE_POLICIES.has(entry.writePolicy)) {
      fail('invalid_response', 'Notebook manifest entry has invalid metadata.');
    }
    manifestByPath.set(entry.path, entry);
  }
  const contentByPath = new Map();
  for (const entry of remote.files) {
    const manifest = manifestByPath.get(entry?.path);
    if (!manifest || typeof entry.content !== 'string' || sha256(entry.content) !== manifest.hash
      || Buffer.byteLength(entry.content, 'utf8') !== manifest.size) {
      fail('hash_mismatch', 'Notebook file content did not match the signed manifest metadata.');
    }
    if (contentByPath.has(entry.path)) fail('invalid_response', 'Notebook response contains duplicate files.');
    contentByPath.set(entry.path, entry);
  }
  for (const removedPath of remote.removedFiles) {
    safeWorkspacePath(workspaceRoot, removedPath, { projectId });
  }
  return { manifestByPath, contentByPath };
};

const collectFiles = (targetPath) => {
  if (!pathExists(targetPath)) return [];
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) fail('unsafe_path', 'Stale generated path is a symlink.');
  if (!stat.isDirectory()) return stat.isFile() ? [targetPath] : [];
  return fs.readdirSync(targetPath).flatMap((name) => collectFiles(path.join(targetPath, name)));
};

const removeEmptyDirsUpTo = (directoryPath, stopDir) => {
  let current = directoryPath;
  while (current.startsWith(stopDir) && current !== stopDir) {
    try { fs.rmdirSync(current); } catch { return; }
    current = path.dirname(current);
  }
};

const pruneLockArchives = (projectDir, pruned, workspaceRoot) => {
  if (!pathExists(projectDir)) return;
  for (const name of fs.readdirSync(projectDir)) {
    if (!name.startsWith(`${LOCK_DIR}.stale-`) && !name.startsWith(`${LOCK_DIR}.unknown-`)
      && !name.startsWith(`${LOCK_DIR}.active-`)) continue;
    const archive = path.join(projectDir, name);
    if (fs.lstatSync(archive).isSymbolicLink()) fail('unsafe_path', 'Sync lock archive is a symlink.');
    fs.rmSync(archive, { recursive: true, force: true });
    pruned.push({ path: path.posix.join('mirage/projects', path.basename(projectDir), name), reason: 'old_sync_lock_archive' });
  }
};

const syncProfileLabel = (profile) => {
  if (profile === 'state') return 'state snapshots';
  if (profile === 'payloads') return 'prompt payload receipts';
  return 'full workbench';
};

export const syncProjectFiles = async (options) => {
  const projectId = normalizeProjectId(options.projectId);
  const syncProfile = normalizeSyncProfile(options.syncProfile || 'full');
  const token = normalizeToken(options.token);
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl || fetch;
  const workspaceRoot = resolveWorkspaceRoot(options.workspace || process.cwd());
  const projectPrefix = `mirage/projects/${projectId}`;
  const projectDir = safeWorkspacePath(workspaceRoot, projectPrefix);
  const statePath = safeWorkspacePath(workspaceRoot, `${projectPrefix}/${STATE_FILE}`, { projectId });
  const workspaceStatePath = safeWorkspacePath(workspaceRoot, WORKSPACE_STATE_FILE);
  const workspaceLockPath = safeWorkspacePath(workspaceRoot, WORKSPACE_LOCK_DIR);
  const projectLockPath = safeWorkspacePath(workspaceRoot, `${projectPrefix}/${LOCK_DIR}`, { projectId });
  let releaseWorkspaceLock = null;
  let releaseProjectLock = null;
  const lockReceipt = {
    workspace: { path: WORKSPACE_LOCK_DIR, acquired: false },
    project: { path: `${projectPrefix}/${LOCK_DIR}`, acquired: false },
  };
  try {
    releaseWorkspaceLock = acquireSyncLock(workspaceRoot, workspaceLockPath, {
      recoverLock: options.recoverLock,
      lockTtlMs: options.lockTtlMs,
      scope: 'workspace',
    });
    lockReceipt.workspace.acquired = true;
    releaseProjectLock = acquireSyncLock(workspaceRoot, projectLockPath, {
      recoverLock: options.recoverLock,
      lockTtlMs: options.lockTtlMs,
      scope: 'project',
    });
    lockReceipt.project.acquired = true;

    const previousProjectState = readJson(statePath, { files: {} });
    const previousWorkspaceState = readJson(workspaceStatePath, { files: {} });
    const previousProjectFiles = previousProjectState.files || {};
    const knownHashes = {};
    for (const [relativePath, entry] of Object.entries(previousProjectFiles)) {
      try {
        const absolutePath = safeWorkspacePath(workspaceRoot, relativePath, { projectId });
        if (pathExists(absolutePath) && HASH_PATTERN.test(entry?.hash)) knownHashes[relativePath] = entry.hash;
      } catch {
        // Old unsafe state entries are never sent back to the server.
      }
    }

    const { data: remote } = await requestJson(
      `${baseUrl}/api/notebook-sync/projects/${encodeURIComponent(projectId)}/notebook`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-mirage-bridge-version': BRIDGE_VERSION,
          ...(options.clientVersion ? { 'x-mirage-cli-version': options.clientVersion } : {}),
        },
        body: JSON.stringify({ knownHashes, syncProfile }),
      },
      token,
      fetchImpl,
    );
    const { contentByPath } = validateRemoteNotebook(remote, projectId, syncProfile, workspaceRoot);
    const remoteManifest = remote.manifest;
    const manifest = remoteManifest.filter((entry) => (
      (entry.scope || 'project') !== 'workspace'
      && pathMatchesSyncProfile(projectId, syncProfile, entry.path)
    ));
    const manifestByPath = new Map(manifest.map((entry) => [entry.path, entry]));
    const written = [];
    const skipped = [];
    const removed = [];
    const pruned = [];
    const conflicts = [];

    for (const entry of manifest) {
      const absolutePath = safeWorkspacePath(workspaceRoot, entry.path, { projectId });
      const incoming = contentByPath.get(entry.path);
      const localContent = pathExists(absolutePath) ? fs.readFileSync(absolutePath) : null;
      const localHash = localContent == null ? null : sha256(localContent);
      const lastKnownHash = previousProjectFiles[entry.path]?.hash || null;
      if (!incoming) {
        skipped.push({ path: entry.path, reason: 'unchanged' });
        continue;
      }
      if (entry.writePolicy === 'create_if_missing' && localContent != null) {
        skipped.push({ path: entry.path, reason: 'exists_create_if_missing' });
        continue;
      }
      if (localHash === entry.hash) {
        skipped.push({ path: entry.path, reason: 'local_matches_server' });
        continue;
      }
      if (entry.writePolicy === 'review_before_overwrite' && localContent != null && !options.force) {
        const localChanged = lastKnownHash ? localHash !== lastKnownHash : true;
        const serverChanged = lastKnownHash ? entry.hash !== lastKnownHash : true;
        if (localChanged && serverChanged) {
          conflicts.push({ path: entry.path, reason: lastKnownHash ? 'local_and_server_changed' : 'untracked_local_file', localHash, lastKnownHash, serverHash: entry.hash });
          continue;
        }
      }
      atomicWriteFile(absolutePath, incoming.content, entry.hash, {
        workspaceRoot,
        beforeRename: options.beforeRename,
      });
      written.push({ path: entry.path, bytes: entry.size, hash: entry.hash });
    }

    const removedCandidates = new Set([
      ...Object.keys(previousProjectFiles).filter((filePath) => (
        pathMatchesSyncProfile(projectId, syncProfile, filePath) && !manifestByPath.has(filePath)
      )),
      ...remote.removedFiles.filter((filePath) => (
        pathMatchesSyncProfile(projectId, syncProfile, filePath) && !manifestByPath.has(filePath)
      )),
    ]);
    for (const relativePath of removedCandidates) {
      const entry = previousProjectFiles[relativePath];
      if (!entry) continue;
      const absolutePath = safeWorkspacePath(workspaceRoot, relativePath, { projectId });
      if (!pathExists(absolutePath)) continue;
      const localHash = sha256(fs.readFileSync(absolutePath));
      if (localHash !== entry.hash && !options.force) {
        conflicts.push({ path: relativePath, reason: 'removed_remote_but_local_changed', localHash, lastKnownHash: entry.hash });
        continue;
      }
      fs.unlinkSync(absolutePath);
      removed.push({ path: relativePath });
    }

    const partialSync = syncProfile !== 'full';
    if (!partialSync) {
      for (const relativePath of [`${projectPrefix}/config/skills.json`, `${projectPrefix}/config/actions`]) {
        if (manifestByPath.has(relativePath)) continue;
        const absolutePath = safeWorkspacePath(workspaceRoot, relativePath, { projectId });
        for (const filePath of collectFiles(absolutePath)) {
          const fileRelativePath = path.relative(workspaceRoot, filePath).split(path.sep).join('/');
          if (manifestByPath.has(fileRelativePath)) continue;
          fs.unlinkSync(filePath);
          removeEmptyDirsUpTo(path.dirname(filePath), path.dirname(absolutePath));
          pruned.push({ path: fileRelativePath, reason: 'old_project_scoped_workspace_file' });
        }
        if (pathExists(absolutePath)) fs.rmSync(absolutePath, { recursive: true, force: true });
      }
    }
    pruneLockArchives(projectDir, pruned, workspaceRoot);

    const removalConflictPaths = new Set(conflicts
      .filter((conflict) => conflict.reason === 'removed_remote_but_local_changed')
      .map((conflict) => conflict.path));
    const nextProjectFiles = Object.fromEntries(Object.entries(previousProjectFiles).filter(([filePath]) => (
      removalConflictPaths.has(filePath)
      || (partialSync && !removedCandidates.has(filePath))
    )));
    for (const entry of manifest) {
      if (conflicts.some((conflict) => conflict.path === entry.path)) {
        if (previousProjectFiles[entry.path]) nextProjectFiles[entry.path] = previousProjectFiles[entry.path];
        continue;
      }
      nextProjectFiles[entry.path] = {
        hash: entry.hash,
        mode: entry.mode,
        scope: entry.scope || 'project',
        writePolicy: entry.writePolicy,
        size: entry.size,
      };
    }
    const now = new Date().toISOString();
    atomicWriteFile(workspaceStatePath, `${JSON.stringify({
      kind: previousWorkspaceState.kind || 'mirage.notebook.workspace_state',
      notebookVersion: remote.notebookVersion,
      workspaceInitializedAt: previousWorkspaceState.workspaceInitializedAt || null,
      workspaceUpdatedAt: previousWorkspaceState.workspaceUpdatedAt || previousWorkspaceState.syncedAt || null,
      lastProject: remote.project,
      syncedAt: now,
      operatingSource: previousWorkspaceState.operatingSource || 'plugin_or_init',
      files: Object.fromEntries(Object.entries(previousWorkspaceState.files || {})
        .filter(([relativePath]) => relativePath === 'AGENTS.md' || relativePath === 'CLAUDE.md')),
    }, null, 2)}\n`, null, { workspaceRoot });
    atomicWriteFile(statePath, `${JSON.stringify({
      kind: 'mirage.notebook.sync_state',
      notebookVersion: remote.notebookVersion,
      project: remote.project,
      syncedAt: now,
      lastSyncProfile: syncProfile,
      partialSyncedAt: partialSync ? now : previousProjectState.partialSyncedAt || null,
      files: nextProjectFiles,
    }, null, 2)}\n`, null, { workspaceRoot });

    return {
      ok: conflicts.length === 0,
      kind: options.receiptKind || 'mirage.bridge.sync',
      projectId,
      syncProfile,
      notebookSchemaVersion: remote.notebookVersion,
      generatedAt: remote.generatedAt,
      skillsHash: remote.skillsHash,
      actionsHash: remote.actionsHash,
      syncedAt: now,
      written: written.length,
      skipped: skipped.length,
      removed: removed.length,
      pruned: pruned.length,
      conflicted: conflicts.length,
      conflicts,
      summary: {
        projectFiles: { total: manifest.length, written: written.length, skipped: skipped.length },
        operatingFiles: { source: 'plugin_or_init', touchedBySync: false, skills: 'plugin', actions: 'mcp' },
        sessionReloadNeeded: false,
        sessionReloadReason: null,
        userAction: 'Project files are synced. No fresh chat is needed from project sync.',
        profile: {
          key: syncProfile,
          label: syncProfileLabel(syncProfile),
          partial: partialSync,
          preservedTrackedFiles: partialSync
            ? Object.keys(nextProjectFiles).filter((filePath) => !manifestByPath.has(filePath)).length
            : 0,
        },
      },
      details: {
        locks: lockReceipt,
        written,
        skipped,
        removed,
        pruned,
        scopes: { workspace: 0, project: Object.keys(nextProjectFiles).length },
      },
    };
  } finally {
    releaseProjectLock?.();
    releaseWorkspaceLock?.();
  }
};

const MIME_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.aac', 'audio/aac'],
  ['.m4a', 'audio/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.flac', 'audio/flac'],
]);

const normalizeUploadFilename = (value) => {
  const basename = path.basename(String(value || 'upload')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (basename || 'upload').slice(0, 255);
};

export const deterministicUploadIdempotencyKey = (input) => {
  const canonical = JSON.stringify({
    projectId: normalizeProjectId(input.projectId),
    purpose: input.purpose,
    entityId: input.entityId || null,
    filename: input.filename,
    contentType: input.contentType,
    size: input.size,
    sha256: input.sha256,
  });
  const salt = input.newUpload ? crypto.randomBytes(16).toString('hex') : '';
  return `mirage-upload-v1-${sha256(`${canonical}\0${salt}`)}`;
};

const validateUploadReceipt = (receipt, expected) => {
  const media = expected.purpose === 'media';
  if (!receipt || (media ? !['video', 'image', 'audio'].includes(receipt.kind) : receipt.kind !== 'mirage.asset.uploaded') || receipt.projectId !== expected.projectId
    || receipt.purpose !== expected.purpose || (receipt.entityId || null) !== (expected.entityId || null)
    || receipt.filename !== expected.filename || (!media && receipt.contentType !== expected.contentType)
    || (media && (receipt.uploadId !== receipt.assetId || receipt.sha256 !== expected.sha256 || !receipt.contentType.startsWith(`${receipt.kind}/`)))
    || receipt.size !== expected.size || typeof receipt.assetId !== 'string' || !receipt.assetId
    || typeof receipt.requestId !== 'string' || !receipt.requestId
    || !receipt.idempotency || receipt.idempotency.key !== expected.idempotencyKey
    || typeof receipt.idempotency.replayed !== 'boolean'
    || receipt.idempotency.replayed !== expected.replayed) {
    fail('invalid_response', 'Sacred returned an invalid asset upload receipt.');
  }
  return receipt;
};

// Inspect tar headers only, never extract a bundle. Bounded streaming keeps large
// media members out of memory while detecting the root FFmpeg job descriptor.
export const compositionRenderer = async (filePath) => {
  const input = fs.createReadStream(filePath);
  const stream = input.pipe(createGunzip());
  let header = Buffer.alloc(0), skip = 0, total = 0;
  try {
    for await (const chunk of stream) {
      total += chunk.length;
      if (total > 2 * 1024 ** 3) fail('invalid_bundle', 'Composition archive exceeds the inspection limit.');
      let offset = 0;
      while (offset < chunk.length) {
        if (skip) { const n = Math.min(skip, chunk.length - offset); skip -= n; offset += n; continue; }
        const n = Math.min(512 - header.length, chunk.length - offset);
        header = Buffer.concat([header, chunk.subarray(offset, offset + n)]); offset += n;
        if (header.length < 512) continue;
        if (header.every((byte) => byte === 0)) return 'render_composition';
        const name = header.subarray(0, 100).toString().split('\0')[0].replace(/^\.\//, '');
        const prefix = header.subarray(345, 500).toString().split('\0')[0];
        const size = header.subarray(124, 136).toString().replace(/\0/g, '').trim();
        if (!/^[0-7]+$/.test(size)) fail('invalid_bundle', 'Composition archive has an invalid member size.');
        if (name === 'ffmpeg-job.json' && !prefix && [0, 48].includes(header[156])) return 'render_media';
        skip = Math.ceil(parseInt(size, 8) / 512) * 512;
        header = Buffer.alloc(0);
      }
    }
    return 'render_composition';
  } finally { stream.destroy(); input.destroy(); }
};

export const uploadProjectAsset = async (options) => {
  const projectId = normalizeProjectId(options.projectId);
  const purpose = String(options.purpose || '').trim();
  if (!ASSET_PURPOSES.has(purpose)) fail('invalid_purpose', 'Upload purpose is not supported.');
  const entityId = options.entityId ? String(options.entityId).trim() : null;
  if (['cast_guide', 'cast_reference', 'env_guide', 'env_reference'].includes(purpose) && !entityId) {
    fail('entity_required', 'This upload purpose requires --entity.');
  }
  if (!['cast_guide', 'cast_reference', 'env_guide', 'env_reference'].includes(purpose) && entityId) {
    fail('entity_not_allowed', 'This upload purpose does not accept --entity.');
  }
  const token = normalizeToken(options.token);
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const filePath = path.resolve(String(options.filePath || ''));
  let stat;
  try { stat = fs.lstatSync(filePath); } catch { fail('file_not_found', 'Upload file was not found.'); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('invalid_file', 'Upload source must be a regular non-symlink file.');
  const bundle = purpose === 'composition_bundle';
  const media = purpose === 'media';
  if (stat.size < 1 || stat.size > (options.maxUploadBytes || (bundle || media ? 500 * 1024 * 1024 : MAX_UPLOAD_BYTES))) {
    fail('file_size_invalid', 'Upload file is empty or exceeds the supported size limit.');
  }
  const filename = normalizeUploadFilename(filePath);
  const contentType = media ? 'application/octet-stream' : bundle ? (filename.endsWith('.tar.gz') ? 'application/gzip' : null) : MIME_TYPES.get(path.extname(filename).toLowerCase());
  if (!contentType) fail('unsupported_media_type', 'Upload file extension is not supported.');
  const renderer = bundle ? await compositionRenderer(filePath) : null;
  let fileHash;
  let body;
  if (media) {
    // A disk-backed Blob streams multipart bytes without retaining the file.
    body = await fs.openAsBlob(filePath, { type: contentType });
    const hash = crypto.createHash('sha256');
    for await (const chunk of body.stream()) hash.update(chunk);
    fileHash = hash.digest('hex');
  } else {
    const bytes = fs.readFileSync(filePath);
    body = new Blob([bytes], { type: contentType });
    fileHash = sha256(bytes);
  }
  if (body.size !== stat.size) fail('file_changed', 'Upload file changed while it was being read.');
  const idempotencyKey = deterministicUploadIdempotencyKey({
    projectId,
    purpose,
    entityId,
    filename,
    contentType,
    size: body.size,
    sha256: fileHash,
    newUpload: options.newUpload,
  });
  const form = new FormData();
  if (bundle) form.append('projectId', projectId);
  form.append('purpose', purpose);
  if (entityId) form.append('entityId', entityId);
  form.append('file', body, filename);
  const { data, response } = await requestJson(
    bundle ? `${baseUrl}/api/agent/uploads` : `${baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/assets/upload`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(bundle ? {} : { 'idempotency-key': idempotencyKey }),
        'x-mirage-bridge-version': BRIDGE_VERSION,
      },
      body: form,
    },
    token,
    options.fetchImpl || fetch,
  );
  if (bundle) {
    if (data?.kind !== 'mirage.agent.upload' || data.projectId !== projectId || data.purpose !== purpose
      || !/^[0-9a-f-]{36}$/.test(data.uploadId || '') || data.uploadId !== data.assetId) {
      fail('invalid_response', 'Sacred returned an invalid composition upload receipt.');
    }
    return { ok: true, kind: options.receiptKind || 'mirage.bridge.upload', projectId, assetId: data.assetId,
      uploadId: data.uploadId, purpose, filename, contentType, size: body.size, sha256: fileHash,
      use: { actionKey: renderer, inputField: 'bundle.uploadId', note: renderer === 'render_media'
        ? 'Pass the complete ffmpeg-job.json with this bundle to render_media. Inspect the downloaded output before request_review.'
        : 'Preview this version on the project page, read timestamped comments, and render_composition after human approval.' } };
  }
  const replayHeader = response.headers.get('idempotency-replayed');
  if (replayHeader !== 'true' && replayHeader !== 'false') {
    fail('invalid_response', 'Sacred returned an invalid asset upload replay receipt.');
  }
  const replayed = replayHeader === 'true';
  const receipt = validateUploadReceipt(data, {
    projectId,
    purpose,
    entityId,
    filename,
    contentType,
    size: body.size,
    sha256: fileHash,
    idempotencyKey,
    replayed,
  });
  return {
    ok: true,
    kind: options.receiptKind || 'mirage.bridge.upload',
    requestId: receipt.requestId,
    projectId,
    assetId: receipt.assetId,
    purpose,
    entityId,
    filename,
    contentType: receipt.contentType,
    size: body.size,
    sha256: fileHash,
    idempotencyKey,
    replayed,
    use: receipt.use,
    ...(media ? { uploadId: receipt.uploadId, mediaKind: receipt.kind, next: receipt.next } : {}),
  };
};

// Client settings prefer the Sacred names; old launch scripts keep working.
export const cliEnv = (name) => process.env[`SACRED_${name}`] || process.env[`MIRAGE_${name}`];
const configuredAuthFile = () => process.env.SACRED_AUTH_FILE
  || (process.env.SACRED_AUTH_DIR && path.join(process.env.SACRED_AUTH_DIR, 'auth.json'))
  || process.env.MIRAGE_AUTH_FILE
  || (process.env.MIRAGE_AUTH_DIR && path.join(process.env.MIRAGE_AUTH_DIR, 'auth.json'));
export const authFilePath = () => configuredAuthFile() || path.join(os.homedir(), '.sacred', 'auth.json');
export const legacyAuthFilePath = () => path.join(os.homedir(), '.mirage', 'auth.json');
export const usesDefaultAuthFile = (file) => !configuredAuthFile() && path.resolve(file) === path.resolve(authFilePath());
export const storedAuthFilePath = (file = authFilePath()) => usesDefaultAuthFile(file) && !fs.existsSync(file)
  ? legacyAuthFilePath() : file;
export const removeAuth = () => {
  const file = authFilePath();
  // Clear both default stores so logout cannot resurrect the legacy login.
  const files = usesDefaultAuthFile(file) ? [legacyAuthFilePath(), file] : [file];
  for (const candidate of files) fs.rmSync(candidate, { force: true });
};

// Both adapters use the credential store written by `sacred login`. Account
// and minted project credentials remain in memory and Authorization headers.
const secrets = new Set();
const redact = (value) => {
  if (typeof value === 'string') {
    for (const secret of secrets) if (secret) value = value.split(secret).join('[redacted]');
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [redact(key), redact(item)]));
  return value;
};
export const bridgeErrorReceipt = (error) => redact({ ok: false,
  code: error instanceof BridgeFailure ? error.code : 'bridge_failed',
  message: error instanceof BridgeFailure ? error.message : 'Sacred bridge failed.',
  ...(error instanceof BridgeFailure && error.details ? { details: error.details } : {}),
});
export const resolveBridgeAuth = async (options) => {
  const projectId = normalizeProjectId(options.projectId);
  if (options.tokenStdin) {
    const token = await readTokenFromStdin();
    secrets.add(token);
    return { token, baseUrl: normalizeBaseUrl(options.baseUrl || cliEnv('API_URL')) };
  }
  const auth = readJson(storedAuthFilePath(), null);
  if (!auth?.mcpToken) fail('auth_missing', 'Run sacred login, or use --token-stdin with a short-lived project token.', undefined, 2);
  const bearer = normalizeToken(auth.mcpToken);
  secrets.add(bearer);
  const baseUrl = normalizeBaseUrl(options.baseUrl || cliEnv('API_URL') || auth.apiUrl);
  if (auth.apiUrl && normalizeBaseUrl(auth.apiUrl) !== baseUrl) {
    fail('auth_origin_mismatch', 'The saved login belongs to another server. Log in to this server or use --token-stdin.', undefined, 2);
  }
  const { data } = await requestJson(`${baseUrl}/api/notebook-sync/projects/${encodeURIComponent(projectId)}/cli-token`, {
    method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttlMinutes: 15 }),
  }, bearer, options.fetchImpl || fetch);
  if (data?.scopeProjectId !== projectId || data?.tokenKind !== 'cli') fail('invalid_response', 'Sacred returned an invalid project credential.');
  const token = normalizeToken(data.token);
  secrets.add(token);
  return { token, baseUrl };
};

const runFileAction = async (options, actionKey, input, idempotencyKey) => {
  const { data } = await requestJson(`${options.baseUrl}/api/v1/projects/${encodeURIComponent(options.projectId)}/actions/run`, {
    method: 'POST', headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
    body: JSON.stringify({ actionKey, input }),
  }, options.token, options.fetchImpl || fetch);
  if (data?.kind !== 'mirage.action.result' || data.actionKey !== actionKey || data.projectId !== options.projectId || !data.result) {
    fail('invalid_response', 'Sacred returned an invalid action receipt.');
  }
  return data.result;
};

export const saveProjectAsset = async (options) => {
  if (!['video', 'image', 'audio', 'composition_bundle'].includes(options.kind)) fail('invalid_kind', 'Use --kind video, image, audio or composition_bundle.');
  const upload = await uploadProjectAsset({ ...options, purpose: options.kind === 'composition_bundle' ? 'composition_bundle' : 'media' });
  if (upload.mediaKind && upload.mediaKind !== options.kind) fail('kind_mismatch', 'The file media type does not match --kind.');
  const input = { projectId: options.projectId, kind: options.kind === 'composition_bundle' ? 'composition' : options.kind,
    source: { uploadId: upload.uploadId },
    ...(options.stage ? { stage: options.stage } : {}), ...(options.slot ? { slot: options.slot } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.derivedFrom?.length ? { derivedFrom: options.derivedFrom.map((assetId) => ({ assetId, role: 'input' })) } : {}),
  };
  const idempotencyKey = `mirage-save-v1-${sha256(JSON.stringify(input))}`;
  const result = await runFileAction(options, 'register_asset', { ...input, idempotencyKey }, idempotencyKey);
  if (!/^[0-9a-f-]{36}$/i.test(result.assetId || '')) fail('invalid_response', 'Sacred returned an invalid saved asset.');
  return { ok: true, kind: options.receiptKind || 'mirage.bridge.save', projectId: options.projectId,
    assetId: result.assetId, uploadId: upload.uploadId, created: result.created, filename: upload.filename };
};

export const fetchProjectAsset = async (options) => {
  if (!options.outputPath) fail('missing_output', 'Use -o <path> for the downloaded file.');
  if (!/^[0-9a-f-]{36}$/i.test(options.assetId || '')) fail('invalid_asset', 'fetch requires an asset UUID.');
  const filePath = path.resolve(options.outputPath);
  if (pathExists(filePath) && !options.force) fail('output_exists', 'Output exists. Choose another path or use --force.');
  const result = await runFileAction(options, 'fetch_asset', { projectId: options.projectId, assetId: options.assetId });
  if (result.assetId !== options.assetId || !result.downloadUrl) fail('download_unavailable', 'This asset is not available to download.');
  let url;
  try { url = new URL(result.downloadUrl); } catch { fail('invalid_response', 'Sacred returned an invalid download URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('invalid_response', 'Sacred returned an invalid download URL.');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = path.join(path.dirname(filePath), `.mirage-fetch-${crypto.randomUUID()}.tmp`);
  try {
    // The signed URL authorizes storage. Never forward an account/project token.
    const response = await (options.fetchImpl || fetch)(url, { redirect: 'error' });
    if (!response.ok || !response.body) fail('download_failed', 'The download failed. Fetch the asset again for a fresh URL.');
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    const size = fs.statSync(temp).size;
    if (result.size != null && size !== result.size) fail('download_size_mismatch', 'Downloaded file size does not match the asset.');
    if (!options.force) {
      fs.linkSync(temp, filePath); // Atomic no-clobber, including a concurrent writer.
      fs.unlinkSync(temp);
    } else fs.renameSync(temp, filePath);
    return { ok: true, kind: options.receiptKind || 'mirage.bridge.fetch', projectId: options.projectId,
      assetId: options.assetId, filePath, size, mediaType: result.mediaType,
      ...(result.reuse ? { reuse: result.reuse, usage: result.usage } : {}) };
  } catch (error) {
    if (error instanceof BridgeFailure) throw error;
    fail('download_failed', 'Could not write the downloaded asset. Check the output path and retry.');
  } finally { fs.rmSync(temp, { force: true }); }
};

export const parseBridgeArgs = (argv) => {
  const command = argv[0];
  if (!['save', 'fetch', 'sync', 'upload'].includes(command)) fail('unknown_command', 'Bridge command must be sync, upload, save or fetch.');
  const options = { command, syncProfile: 'full', workspace: process.cwd() };
  const fields = { '--project': 'projectId', '--profile': 'syncProfile', '--purpose': 'purpose', '--file': 'filePath',
    '--entity': 'entityId', '--base-url': 'baseUrl', '--api-url': 'baseUrl', '--kind': 'kind', '--stage': 'stage',
    '--slot': 'slot', '--label': 'label', '-o': 'outputPath', '--output': 'outputPath', '--asset': 'assetId' };
  const flags = { '--token-stdin': 'tokenStdin', '--new-upload': 'newUpload', '--force': 'force', '--recover-lock': 'recoverLock' };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (flags[arg]) options[flags[arg]] = true;
    else if (fields[arg] || arg === '--derived-from') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) fail('missing_value', 'A command option is missing its value.');
      if (arg === '--derived-from') (options.derivedFrom ||= []).push(value);
      else options[fields[arg]] = value;
    } else if (i === 1 && !arg.startsWith('-') && ['save', 'fetch'].includes(command)) {
      options[command === 'save' ? 'filePath' : 'assetId'] = arg;
    } else fail('unknown_arg', 'Unknown bridge option. Tokens are accepted only through login or --token-stdin.');
  }
  if (!options.projectId) fail('missing_project', '--project is required.');
  options.projectId = normalizeProjectId(options.projectId);
  return options;
};
export const runBridgeCommand = async (options, adapter = 'plugin') => {
  const auth = await resolveBridgeAuth(options);
  const input = { ...options, ...auth, receiptKind: `mirage.${adapter}.${options.command}` };
  const run = { sync: syncProjectFiles, upload: uploadProjectAsset, save: saveProjectAsset, fetch: fetchProjectAsset }[options.command];
  return redact(await run(input));
};
