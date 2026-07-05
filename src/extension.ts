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
        const tasksProvider = new TasksProvider(context.workspaceState, context.globalStorageUri);
        
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('fastTasksView', tasksProvider),
            ...registerCommands(tasksProvider)
        );

        // Refresh on configuration change (task definitions, flat list or hide handling)
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('tasks')) {
                    // The "tasks" section changed — or finished loading after activation
                    // (user tasks.json can arrive late on slow startups and forks):
                    // reload icon/hide/location maps and re-fetch the task list
                    tasksProvider.refresh(false, true, true);
                } else if (
                    e.affectsConfiguration('fast-tasks.flatList') ||
                    e.affectsConfiguration('fast-tasks.ignoreHide')
                ) {
                    // No need to reload icons or invalidate cache for config-only changes
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
