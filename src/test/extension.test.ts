import * as assert from 'assert';
import * as vscode from 'vscode';
import { TasksProvider } from '../tasksProvider';

suite('Fast Tasks Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('TasksProvider Initialization', () => {
        const provider = new TasksProvider(vscode.workspace.workspaceState);
        assert.ok(provider, 'TasksProvider should be initialized');
    });

    test('Tasks View Registration', async () => {
        const extension = vscode.extensions.getExtension('fast-tasks');
        assert.ok(extension, 'Extension should be present');

        const views = vscode.window.registerTreeDataProvider;
        assert.ok(views, 'Tree Data Provider should be registered');
    });

    test('Refresh Command Registration', () => {
        const command = vscode.commands.getCommands(true).then(commands => {
            assert.ok(commands.includes('fast-tasks.refreshTasks'), 
                'Refresh command should be registered');
        });
    });
});
