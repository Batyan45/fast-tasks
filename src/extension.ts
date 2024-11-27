import * as vscode from 'vscode';
import { TasksProvider, TaskItem } from './tasksProvider';

const COMMANDS = {
    refreshTasks: 'fast-tasks.refreshTasks',
    selectTasks: 'fast-tasks.selectTasks',
    stopTask: 'fast-tasks.stopTask'
} as const;

export function activate(context: vscode.ExtensionContext): void {
    try {
        const tasksProvider = new TasksProvider(context.workspaceState);
        
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('fastTasksView', tasksProvider),
            ...registerCommands(tasksProvider)
        );
    } catch (error) {
        console.error('Failed to activate Fast Tasks extension:', error);
        void vscode.window.showErrorMessage('Failed to activate Fast Tasks extension');
    }
}

function registerCommands(tasksProvider: TasksProvider): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand(
            COMMANDS.refreshTasks, 
            () => tasksProvider.refresh(true)
        ),
        vscode.commands.registerCommand(
            COMMANDS.selectTasks, 
            () => tasksProvider.selectTasks()
        ),
        vscode.commands.registerCommand(
            COMMANDS.stopTask, 
            (item: TaskItem) => tasksProvider.stopTask(item)
        )
    ];
}

export function deactivate(): void {}
