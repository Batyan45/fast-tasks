import * as vscode from 'vscode';

export class TasksProvider implements vscode.TreeDataProvider<TaskItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TaskItem | undefined | null | void> = new vscode.EventEmitter<TaskItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TaskItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private workspaceState: vscode.Memento) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TaskItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TaskItem): Promise<TaskItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return Promise.resolve([]);
        }

        const tasks = await vscode.tasks.fetchTasks();
        return tasks.map(task => new TaskItem(
            task.name,
            task.definition.type,
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'workbench.action.tasks.runTask',
                title: '',
                arguments: [task.name]
            }
        ));
    }
}

class TaskItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly taskType: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label} (${this.taskType})`;
        this.description = this.taskType;
        this.contextValue = 'task';
        this.iconPath = new vscode.ThemeIcon('terminal');
    }
}
