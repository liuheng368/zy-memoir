#!/usr/bin/env node
/**
 * 兼容入口：转发至公共实现
 * `.cursor/skills/_shared/create-feature-spec/create-feature-spec.mjs`
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(__dirname, '..', '..', '_shared', 'create-feature-spec', 'create-feature-spec.mjs');
const r = spawnSync(process.execPath, [shared, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
