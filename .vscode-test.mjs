import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@vscode/test-cli';

const workspace = mkdtempSync(join(tmpdir(), 'fast-tasks-tests-'));
mkdirSync(join(workspace, 'first'));
mkdirSync(join(workspace, 'second'));
const workspaceFile = join(workspace, 'tests.code-workspace');
writeFileSync(workspaceFile, JSON.stringify({ folders: [{ path: 'first' }, { path: 'second' }] }));

export default defineConfig({
	files: ['out/src/test/**/*.test.js', 'out/tests/integration/**/*.test.js'],
	workspaceFolder: workspaceFile,
	mocha: { timeout: 20000 },
	useInstallation: process.env.VSCODE_TEST_EXECUTABLE
		? { fromPath: process.env.VSCODE_TEST_EXECUTABLE }
		: undefined,
});
