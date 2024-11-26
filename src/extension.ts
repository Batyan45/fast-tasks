// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TasksProvider, TaskItem } from './tasksProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    const tasksProvider = new TasksProvider(context.workspaceState);
    
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('fastTasksView', tasksProvider),
        vscode.commands.registerCommand('fast-tasks.refreshTasks', () => tasksProvider.refresh(true)),
        vscode.commands.registerCommand('fast-tasks.selectTasks', () => tasksProvider.selectTasks()),
        vscode.commands.registerCommand('fast-tasks.stopTask', (item: TaskItem) => tasksProvider.stopTask(item))
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
