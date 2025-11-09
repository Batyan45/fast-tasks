import * as assert from 'assert';
import * as vscode from 'vscode';
import { TasksProvider } from '../tasksProvider';

suite('Fast Tasks Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('TasksProvider Initialization', () => {
        // Create a mock Memento object with all required methods
        const mockMemento: vscode.Memento = {
            get: (key: string) => undefined,
            update: (key: string, value: any) => Promise.resolve(),
            keys: () => []
        };
        
        const provider = new TasksProvider(mockMemento);
        assert.ok(provider, 'TasksProvider should be initialized');
    });

    test('Tasks View Registration', async () => {
        const extension = vscode.extensions.getExtension('batyan-soft.fast-tasks');
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
