#!/usr/bin/env node
import { BridgeFailure, bridgeErrorReceipt, parseBridgeArgs, runBridgeCommand } from './bridge-core.mjs';

try {
  const receipt = await runBridgeCommand(parseBridgeArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.conflicted ? 3 : 0;
} catch (error) {
  process.stdout.write(`${JSON.stringify(bridgeErrorReceipt(error))}\n`);
  process.exitCode = error instanceof BridgeFailure ? error.exitCode : 1;
}
