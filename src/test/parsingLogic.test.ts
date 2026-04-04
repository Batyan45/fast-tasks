import * as assert from 'assert';
import * as JSONC from 'jsonc-parser';

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
