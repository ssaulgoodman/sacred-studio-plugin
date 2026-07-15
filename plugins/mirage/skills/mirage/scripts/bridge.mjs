#!/usr/bin/env node
import { BridgeFailure, readTokenFromStdin, syncProjectFiles, uploadProjectAsset } from './bridge-core.mjs';

const output = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

const parseArgs = (argv) => {
  const command = argv[0];
  const options = { command, syncProfile: 'full', workspace: process.cwd() };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project') options.projectId = argv[++index];
    else if (arg === '--profile') options.syncProfile = argv[++index];
    else if (arg === '--purpose') options.purpose = argv[++index];
    else if (arg === '--file') options.filePath = argv[++index];
    else if (arg === '--entity') options.entityId = argv[++index];
    else if (arg === '--base-url') options.baseUrl = argv[++index];
    else if (arg === '--token-stdin') options.tokenStdin = true;
    else if (arg === '--new-upload') options.newUpload = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--recover-lock') options.recoverLock = true;
    else throw new BridgeFailure('unknown_arg', 'Unknown bridge option.');
  }
  if (!options.tokenStdin) throw new BridgeFailure('auth_missing', 'Use --token-stdin; tokens are never accepted in argv or environment.', undefined, 2);
  if (!options.projectId) throw new BridgeFailure('missing_project', '--project is required.');
  return options;
};

let token = '';
try {
  const options = parseArgs(process.argv.slice(2));
  token = await readTokenFromStdin();
  if (options.command === 'sync') {
    const receipt = await syncProjectFiles({ ...options, token, receiptKind: 'mirage.plugin.sync' });
    output(receipt);
    process.exitCode = receipt.conflicted ? 3 : 0;
  } else if (options.command === 'upload') {
    output(await uploadProjectAsset({ ...options, token, receiptKind: 'mirage.plugin.upload' }));
  } else {
    throw new BridgeFailure('unknown_command', 'Bridge command must be sync or upload.');
  }
} catch (error) {
  const message = error instanceof BridgeFailure ? error.message : 'Sacred bridge failed.';
  output({
    ok: false,
    code: error instanceof BridgeFailure ? error.code : 'bridge_failed',
    message: token && message.includes(token) ? 'Sacred bridge failed.' : message,
    details: error instanceof BridgeFailure ? error.details : undefined,
  });
  process.exit(error instanceof BridgeFailure ? error.exitCode : 1);
}
