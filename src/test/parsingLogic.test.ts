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
        const tasksNode = JSONC.findNodeAtLocation(tree, ['tasks']);
        assert.ok(tasksNode);

        const tasks = tasksNode.children;
        assert.ok(tasks);
        assert.strictEqual(tasks.length, 1);

        const taskDef = JSONC.getNodeValue(tasks[0]);
        assert.strictEqual(taskDef.label, "Workspace Task");
        assert.deepStrictEqual(taskDef.icon, { id: "beaker", color: "terminal.ansiGreen" });
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

        const settingsTasksNode = JSONC.findNodeAtLocation(tree, ['settings', 'tasks']);
        assert.ok(settingsTasksNode);

        const innerTasksNode = JSONC.findNodeAtLocation(settingsTasksNode, ['tasks']);
        assert.ok(innerTasksNode);

        const tasks = innerTasksNode.children;
        assert.ok(tasks);
        assert.strictEqual(tasks.length, 1);

        const taskDef = JSONC.getNodeValue(tasks[0]);
        assert.strictEqual(taskDef.label, "Settings Task");
        assert.deepStrictEqual(taskDef.icon, { id: "zap", color: "terminal.ansiYellow" });
    });
});
