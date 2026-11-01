import * as assert from 'assert';
import * as vscode from 'vscode';
import { AdditionalTaskSchemas } from '../../../src/additionalTaskSchemas';

suite('Additional task schemas', () => {
    const schemaUrl = 'fast-tasks://schemas/tasks';
    let schemas: AdditionalTaskSchemas;
    const setPatterns = (folder: vscode.WorkspaceFolder, patterns: string[]) =>
        vscode.workspace.getConfiguration('fast-tasks', folder.uri)
            .update('includeAdditionalTasksFiles', patterns, vscode.ConfigurationTarget.WorkspaceFolder);
    const config = (folder: vscode.WorkspaceFolder) => vscode.workspace.getConfiguration('json', folder.uri);
    const associations = (folder: vscode.WorkspaceFolder) =>
        config(folder).inspect<{ url: string; fileMatch: string[] }[]>('schemas')?.workspaceFolderValue ?? [];

    setup(async () => {
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            await setPatterns(folder, []);
            await config(folder).update('schemas', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
        }
        schemas = new AdditionalTaskSchemas(folder => vscode.workspace.getConfiguration('fast-tasks', folder.uri)
            .get<string[]>('includeAdditionalTasksFiles', []));
        await schemas.sync();
    });

    teardown(async () => {
        schemas.dispose();
        await schemas.sync();
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            await config(folder).update('schemas', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
            await setPatterns(folder, []);
        }
    });

    test('test_patterns_are_folder_scoped_and_existing_schemas_survive', async () => {
        const [first, second] = vscode.workspace.workspaceFolders!;
        const existing = { url: 'https://example.com/schema.json', fileMatch: ['other.json'] };
        await config(first).update('schemas', [existing], vscode.ConfigurationTarget.WorkspaceFolder);
        await setPatterns(first, ['.vscode/tasks-*.json', 'automation/**/*.tasks.json']);
        await setPatterns(second, ['scripts/*.json']);
        await schemas.sync();
        assert.deepStrictEqual(associations(first)[0], existing);
        assert.deepStrictEqual(associations(first)[1].fileMatch,
            ['.vscode/tasks-*.json', 'automation/**/*.tasks.json']);
        assert.deepStrictEqual(associations(second)[0].fileMatch, ['scripts/*.json']);
        await setPatterns(first, ['new/*.json']);
        await schemas.sync();
        assert.strictEqual(associations(first).length, 2);
        assert.deepStrictEqual(associations(first)[1].fileMatch, ['new/*.json']);
        await setPatterns(first, []);
        await schemas.sync();
        assert.deepStrictEqual(associations(first), [existing]);
        assert.strictEqual(associations(second)[0].url, schemaUrl);
    });

    test('test_matching_file_uses_builtin_tasks_schema_for_completion_and_validation', async () => {
        const folder = vscode.workspace.workspaceFolders![0];
        await setPatterns(folder, ['automation/**/*.tasks.json']);
        await schemas.sync();
        const uri = vscode.Uri.joinPath(folder.uri, 'automation', 'nested', 'schema.tasks.json');
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
        await vscode.workspace.fs.writeFile(uri, Buffer.from('{\n "version": "2.0.0",\n "tasks": [{ "label": "Example", "type": "shell", "command": "echo ok", "presentation": {} }]\n}'));
        try {
            await vscode.extensions.getExtension('vscode.json-language-features')?.activate();
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
            const offset = document.getText().indexOf('"presentation": {') + '"presentation": {'.length;
            let labels: string[] = [];
            for (let attempt = 0; attempt < 50; attempt++) {
                const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                    'vscode.executeCompletionItemProvider', uri, document.positionAt(offset));
                labels = (completions?.items ?? []).map(item =>
                    typeof item.label === 'string' ? item.label : item.label.label);
                if (labels.includes('reveal')) { break; }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            assert.ok(labels.includes('reveal'), `Missing task presentation completions: ${labels}`);
            const edit = new vscode.WorkspaceEdit();
            const start = document.getText().indexOf('"2.0.0"');
            edit.replace(uri, new vscode.Range(document.positionAt(start), document.positionAt(start + 7)), '123');
            await vscode.workspace.applyEdit(edit);
            let diagnostics: readonly vscode.Diagnostic[] = [];
            for (let attempt = 0; attempt < 50; attempt++) {
                diagnostics = vscode.languages.getDiagnostics(uri);
                if (diagnostics.some(diagnostic => diagnostic.range.start.line === 1)) { break; }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            assert.ok(diagnostics.some(diagnostic => diagnostic.range.start.line === 1),
                'Invalid task version should produce a schema diagnostic');
        } finally {
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
            await vscode.workspace.fs.delete(uri);
        }
    });
});
