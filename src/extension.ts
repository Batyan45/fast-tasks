import * as vscode from 'vscode';
import { TasksProvider, TaskItem } from './tasksProvider';

const COMMANDS = {
    refreshTasks: 'fast-tasks.refreshTasks',
    selectTasks: 'fast-tasks.selectTasks',
    stopTask: 'fast-tasks.stopTask',
    editTask: 'fast-tasks.editTask',
    runTask: 'fast-tasks.runTask'
} as const;

export function activate(context: vscode.ExtensionContext): void {
    try {
        const tasksProvider = new TasksProvider(context.workspaceState);
        
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('fastTasksView', tasksProvider),
            ...registerCommands(tasksProvider)
        );

        // Refresh on configuration change toggling flat list
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('fast-tasks.flatList')) {
                    tasksProvider.refresh(false, false, false);
                }
            })
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
            () => tasksProvider.refresh(true, true, true)
        ),
        vscode.commands.registerCommand(
            COMMANDS.selectTasks, 
            () => tasksProvider.selectTasks()
        ),
        vscode.commands.registerCommand(
            COMMANDS.stopTask, 
            (item: TaskItem) => tasksProvider.stopTask(item)
        ),
        vscode.commands.registerCommand(
            COMMANDS.editTask,
            (item: TaskItem) => tasksProvider.editTask(item)
        ),
        vscode.commands.registerCommand(
            COMMANDS.runTask,
            async (task: vscode.Task) => tasksProvider.runTask(task)
        )
    ];
}

export function deactivate(): void {}
