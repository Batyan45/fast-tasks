import * as assert from 'assert';
import * as JSONC from 'jsonc-parser';
import { extractTaskDefinitions } from '../tasksProvider';

suite('extractTaskDefinitions', () => {
    test('Extracts tasks from a standard configuration object', () => {
        const value = {
            version: '2.0.0',
            tasks: [
                { label: 'Build', type: 'shell', icon: { id: 'package', color: 'charts.blue' } },
                { label: 'Test', type: 'shell' }
            ]
        };

        const tasks = extractTaskDefinitions(value);
        assert.strictEqual(tasks.length, 2);
        assert.strictEqual(tasks[0].label, 'Build');
        assert.strictEqual(tasks[0].icon?.id, 'package');
        assert.strictEqual(tasks[0].icon?.color, 'charts.blue');
    });

    test('Extracts tasks from a legacy array', () => {
        const value = [{ label: 'Legacy', type: 'shell' }];

        const tasks = extractTaskDefinitions(value);
        assert.strictEqual(tasks.length, 1);
        assert.strictEqual(tasks[0].label, 'Legacy');
    });

    test('Returns empty array for undefined or malformed values', () => {
        assert.deepStrictEqual(extractTaskDefinitions(undefined), []);
        assert.deepStrictEqual(extractTaskDefinitions(null), []);
        assert.deepStrictEqual(extractTaskDefinitions('string'), []);
        assert.deepStrictEqual(extractTaskDefinitions({ version: '2.0.0' }), []);
        assert.deepStrictEqual(extractTaskDefinitions({ tasks: 'not-an-array' }), []);
    });

    test('Filters out non-object entries', () => {
        const value = { tasks: [{ label: 'Valid' }, null, 'invalid', 42] };

        const tasks = extractTaskDefinitions(value);
        assert.strictEqual(tasks.length, 1);
        assert.strictEqual(tasks[0].label, 'Valid');
    });
});

suite('Task Parsing Logic', () => {
    test('Parse .code-workspace tasks (Standard)', () => {
        const content = `
        {
            "folders": [],
            "tasks": {
                "version": "2.0.0",
                "tasks": [
                    {
                        "label": "Workspace Task",
                        "type": "shell",
                        "command": "echo hello",
                        "icon": { "id": "beaker", "color": "terminal.ansiGreen" }
                    }
                ]
            }
        }`;

        const tree = JSONC.parseTree(content);
        assert.ok(tree);
        const tasksNode = JSONC.findNodeAtLocation(tree, ['tasks', 'tasks']);
        assert.ok(tasksNode);

        const tasks = tasksNode.children;
        assert.ok(tasks);
        assert.strictEqual(tasks.length, 1);

        const taskDef = JSONC.getNodeValue(tasks[0]);
        assert.strictEqual(taskDef.label, "Workspace Task");
        assert.strictEqual(taskDef.icon.id, "beaker");
        assert.strictEqual(taskDef.icon.color, "terminal.ansiGreen");
    });

    test('Parse .code-workspace tasks (Settings)', () => {
        const content = `
        {
            "folders": [],
            "settings": {
                "tasks": {
                    "version": "2.0.0",
                    "tasks": [
                        {
                            "label": "Settings Task",
                            "type": "shell",
                            "command": "echo hello",
                            "icon": { "id": "zap", "color": "terminal.ansiYellow" }
                        }
                    ]
                }
            }
        }`;

        const tree = JSONC.parseTree(content);
        assert.ok(tree);

        const settingsTasksNode = JSONC.findNodeAtLocation(tree, ['settings', 'tasks', 'tasks']);
        assert.ok(settingsTasksNode);

        const tasks = settingsTasksNode.children;
        assert.ok(tasks);
        assert.strictEqual(tasks.length, 1);

        const taskDef = JSONC.getNodeValue(tasks[0]);
        assert.strictEqual(taskDef.label, "Settings Task");
        assert.strictEqual(taskDef.icon.id, "zap");
        assert.strictEqual(taskDef.icon.color, "terminal.ansiYellow");
    });
});
