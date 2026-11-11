import * as assert from 'assert';
import * as vscode from 'vscode';
import { AdditionalTasks } from '../../../src/additionalTasks';
import { TaskItem, TasksProvider } from '../../../src/tasksProvider';

suite('Additional task files', () => {
    let folder: vscode.WorkspaceFolder;
    let source: AdditionalTasks;
    const files: vscode.Uri[] = [];
    const config = () => vscode.workspace.getConfiguration('fast-tasks', folder.uri);
    const write = async (name: string, content: string): Promise<vscode.Uri> => {
        const uri = vscode.Uri.joinPath(folder.uri, name);
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
        files.push(uri);
        return uri;
    };
    const state: vscode.Memento = {
        get: <T>(_key: string, defaultValue?: T) => defaultValue as T,
        update: async () => {},
        keys: () => []
    };

    setup(async () => {
        folder = vscode.workspace.workspaceFolders![0];
        assert.ok(folder);
        await vscode.workspace.getConfiguration('fast-tasks', vscode.workspace.workspaceFolders![1].uri)
            .update('includeAdditionalTasksFiles', [], vscode.ConfigurationTarget.WorkspaceFolder);
        await config().update('includeAdditionalTasksFiles', ['.vscode/tasks-*.json'], vscode.ConfigurationTarget.WorkspaceFolder);
        source = new AdditionalTasks(() => {});
    });

    teardown(async () => {
        source?.dispose();
        for (const uri of files.splice(0)) {
            await vscode.workspace.fs.delete(uri);
        }
        await config().update('includeAdditionalTasksFiles', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
        await config().update('ignoreHide', undefined, vscode.ConfigurationTarget.Workspace);
        await config().update('flatList', undefined, vscode.ConfigurationTarget.Workspace);
    });

    test('test_load_jsonc_shell_process_metadata_and_platform_options', async () => {
        const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
        const uri = await write('.vscode/tasks-extra.json', `{
            // JSONC comments and trailing commas are supported.
            "version": "2.0.0",
            "options": { "env": { "SHARED": "yes" } },
            "tasks": [
                { "label": "Shell", "type": "shell", "command": "echo base",
                  "${platform}": { "command": "echo platform" },
                  "icon": { "id": "beaker", "color": "charts.blue" },
                  "hide": true, "group": "test", "presentation": { "reveal": "silent" } },
                { "label": "Process", "type": "process", "command": "echo", "args": ["hello"] },
            ],
        }`);
        const tasks = await source.load();
        assert.strictEqual(tasks.length, 2);
        assert.strictEqual(tasks[0].scope, folder);
        assert.ok(tasks[0].execution instanceof vscode.ShellExecution);
        assert.strictEqual(tasks[0].execution.commandLine, 'echo platform');
        assert.strictEqual(tasks[0].execution.options?.cwd, folder.uri.fsPath);
        assert.strictEqual(tasks[0].execution.options?.env?.SHARED, 'yes');
        assert.strictEqual(tasks[0].group, vscode.TaskGroup.Test);
        assert.strictEqual(tasks[0].presentationOptions.reveal, vscode.TaskRevealKind.Silent);
        assert.strictEqual(source.getInfo(tasks[0])?.uri.toString(), uri.toString());
        assert.strictEqual(source.getInfo(tasks[0])?.line, 5);
        const executionCopy = new vscode.Task(tasks[0].definition, folder, tasks[0].name, 'Workspace', tasks[0].execution);
        assert.strictEqual(source.getInfo(executionCopy)?.id, source.getInfo(tasks[0])?.id);
        assert.strictEqual(source.getInfo(tasks[0])?.definition.hide, true);
        assert.ok(tasks[1].execution instanceof vscode.ProcessExecution);
        assert.deepStrictEqual(tasks[1].execution.args, ['hello']);
    });

    test('test_overlap_empty_patterns_and_standard_file_exclusion', async () => {
        await write('.vscode/tasks-extra.json', '{"tasks":[{"label":"Extra","type":"shell","command":"echo extra"}]}');
        await write('.vscode/tasks.json', '{"version":"2.0.0","tasks":[]}');
        await config().update('includeAdditionalTasksFiles', ['.vscode/*.json', '.vscode/tasks-*.json'], vscode.ConfigurationTarget.WorkspaceFolder);
        assert.strictEqual((await source.load()).length, 1);
        await config().update('includeAdditionalTasksFiles', [], vscode.ConfigurationTarget.WorkspaceFolder);
        assert.deepStrictEqual(await source.load(), []);
    });

    test('test_invalid_file_and_invalid_entry_do_not_hide_valid_tasks', async () => {
        await write('.vscode/tasks-broken.json', '{ nope');
        await write('.vscode/tasks-valid.json', JSON.stringify({ tasks: [
            null, 7, { label: 1, command: 'echo invalid' },
            { label: 'Invalid', command: 42 },
            { label: 'Valid', type: 'shell', command: 'echo valid' }
        ] }));
        assert.deepStrictEqual((await source.load()).map(task => task.name), ['Valid']);
    });

    test('test_provider_hide_icons_selection_identity_and_edit_location', async () => {
        const first = await write('.vscode/tasks-one.json', JSON.stringify({ tasks: [
            { label: 'Same', type: 'shell', command: 'echo one', hide: true, icon: { id: 'beaker' } }
        ] }));
        const second = await write('.vscode/tasks-two.json', JSON.stringify({ tasks: [
            { label: 'Same', type: 'shell', command: 'echo two', icon: { id: 'rocket' } }
        ] }));
        await config().update('flatList', true, vscode.ConfigurationTarget.Workspace);
        const provider = new TasksProvider(state);
        try {
            let children = (await provider.getChildren()) as TaskItem[];
            assert.strictEqual(children.length, 1);
            assert.strictEqual((children[0].iconPath as vscode.ThemeIcon).id, 'rocket');
            await provider.editTask(children[0]);
            assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), second.toString());
            await config().update('ignoreHide', true, vscode.ConfigurationTarget.Workspace);
            children = (await provider.getChildren()) as TaskItem[];
            assert.strictEqual(children.length, 2);
            assert.strictEqual((children[0].iconPath as vscode.ThemeIcon).id, 'beaker');
            await provider.editTask(children[0]);
            assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), first.toString());
            const tasks = await source.load();
            assert.notStrictEqual(source.getInfo(tasks[0])?.id, source.getInfo(tasks[1])?.id);
        } finally {
            provider.dispose();
        }
    });

    test('test_create_change_delete_and_configuration_refresh', async () => {
        source.dispose();
        let notify: (() => void) | undefined;
        source = new AdditionalTasks(() => notify?.());
        const change = (action: () => PromiseLike<unknown>) => new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('No file change event')), 10000);
            notify = () => { clearTimeout(timeout); resolve(); };
            void Promise.resolve(action()).then(() => {}, reject);
        });
        const uri = vscode.Uri.joinPath(folder.uri, '.vscode', 'tasks-events.json');
        await change(async () => {
            await write('.vscode/tasks-events.json', '{"tasks":[]}');
        });
        await change(() => vscode.workspace.fs.writeFile(uri!, Buffer.from('{"tasks": [], "version":"2.0.0"}')));
        await change(() => vscode.workspace.fs.delete(uri!));
        files.splice(files.findIndex(file => file.toString() === uri!.toString()), 1);
        await change(() => config().update('includeAdditionalTasksFiles', [], vscode.ConfigurationTarget.WorkspaceFolder));
    });

    test('test_execute_process_and_sequence_compound_dependencies', async () => {
        const marker = vscode.Uri.joinPath(folder.uri, 'dependency-output.txt');
        files.push(marker);
        const first = `require('fs').writeFileSync(${JSON.stringify(marker.fsPath)}, 'first')`;
        const second = `const fs = require('fs'); if (fs.readFileSync(${JSON.stringify(marker.fsPath)}, 'utf8') !== 'first') process.exit(2); fs.appendFileSync(${JSON.stringify(marker.fsPath)}, '-second')`;
        await write('.vscode/tasks-run.json', JSON.stringify({ tasks: [
            { label: 'First', type: 'process', command: process.execPath, args: ['-e', first], options: { env: { ELECTRON_RUN_AS_NODE: '1' } } },
            { label: 'Second', type: 'process', command: process.execPath, args: ['-e', second], options: { env: { ELECTRON_RUN_AS_NODE: '1' } } },
            { label: 'Compound', dependsOn: ['First', 'Second'], dependsOrder: 'sequence' }
        ] }));
        const tasks = await source.load();
        await source.run(tasks[2], tasks);
        assert.strictEqual(Buffer.from(await vscode.workspace.fs.readFile(marker)).toString(), 'first-second');
    });

    test('test_multi_root_folder_patterns_and_duplicate_labels', async () => {
        const other = vscode.workspace.workspaceFolders![1];
        try {
            await vscode.workspace.getConfiguration('fast-tasks', other.uri).update(
                'includeAdditionalTasksFiles', ['custom/*.json'], vscode.ConfigurationTarget.WorkspaceFolder);
            await write('.vscode/tasks-root.json', '{"tasks":[{"label":"Same","type":"shell","command":"echo root"}]}');
            const uri = vscode.Uri.joinPath(other.uri, 'custom', 'tasks.json');
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(other.uri, 'custom'));
            await vscode.workspace.fs.writeFile(uri, Buffer.from('{"tasks":[{"label":"Same","type":"shell","command":"echo other"}]}'));
            files.push(uri);
            const tasks = await source.load();
            assert.strictEqual(tasks.length, 2);
            assert.strictEqual(tasks[0].scope, folder);
            assert.strictEqual(tasks[1].scope, other);
            assert.strictEqual(source.getInfo(tasks[1])?.uri.toString(), uri.toString());
        } finally {
            await vscode.workspace.getConfiguration('fast-tasks', other.uri).update(
                'includeAdditionalTasksFiles', [], vscode.ConfigurationTarget.WorkspaceFolder);
        }
    });

    test('test_provider_task_definitions_are_preserved_for_resolution', async () => {
        await write('.vscode/tasks-provider.json', JSON.stringify({ tasks: [
            { label: 'Npm', type: 'npm', script: 'test', path: 'frontend', problemMatcher: ['$tsc'] }
        ] }));
        const [task] = await source.load();
        assert.strictEqual(task.definition.type, 'npm');
        assert.strictEqual(task.definition.script, 'test');
        assert.strictEqual(task.definition.path, 'frontend');
        assert.deepStrictEqual(task.problemMatchers, ['$tsc']);
        assert.strictEqual(task.execution, undefined);
    });

    test('test_missing_and_circular_dependencies_reject', async () => {
        await write('.vscode/tasks-deps.json', JSON.stringify({ tasks: [
            { label: 'Missing', dependsOn: 'Nope' },
            { label: 'Cycle', dependsOn: 'Cycle' }
        ] }));
        const tasks = await source.load();
        await assert.rejects(source.run(tasks[0], tasks), /not found/);
        await assert.rejects(source.run(tasks[1], tasks), /Circular/);
    });
});
