import * as vscode from 'vscode';

export class TasksProvider implements vscode.TreeDataProvider<TaskItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TaskItem | undefined | null | void> = new vscode.EventEmitter<TaskItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TaskItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private workspaceState: vscode.Memento) {
        this.selectedTasks = this.workspaceState.get('selectedTasks', []);
    }

    private selectedTasks: string[] = [];

    async selectTasks(): Promise<void> {
        const tasks = await vscode.tasks.fetchTasks();
        const configuredTasks = tasks.filter(task => 
            task.source === 'Workspace' || 
            (task as any)._source?.kind === 2 // TaskSourceKind.WorkspaceFile = 2
        );
        
        const taskItems = configuredTasks.map(task => ({
            label: task.name,
            picked: this.selectedTasks.includes(task.name)
        }));

        const selected = await vscode.window.showQuickPick(taskItems, {
            canPickMany: true,
            title: 'Select Tasks to Display'
        });

        if (selected) {
            this.selectedTasks = selected.map(item => item.label);
            await this.workspaceState.update('selectedTasks', this.selectedTasks);
            this.refresh();
        }
    }

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
        
        return tasks
            .filter(task => {
                const isConfigured = task.source === 'Workspace' || 
                                   (task as any)._source?.kind === 2; // TaskSourceKind.WorkspaceFile = 2
                return isConfigured && 
                       (this.selectedTasks.length === 0 || 
                        this.selectedTasks.includes(task.name));
            })
            .map(task => {
                const taskItem = new TaskItem(
                    task.name,
                    task.definition.type,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'workbench.action.tasks.runTask',
                        title: '',
                        arguments: [task.name]
                    }
                );
                
                if (this.selectedTasks.includes(task.name)) {
                    taskItem.resourceUri = vscode.Uri.parse(`task://${task.name}`);
                }
                
                return taskItem;
            });
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
        
        this.label = label;
        this.tooltip = new vscode.MarkdownString(`**Task:** ${label}\n\n**Type:** ${this.taskType}`);
        this.description = this.taskType;
        this.contextValue = 'task';
        
        const iconName = this.getIconNameFromLabel(label.toLowerCase());
        const iconColor = this.getColorFromTaskType(taskType.toLowerCase());
        
        this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(iconColor));
    }

    private getIconNameFromLabel(label: string): string {
        if (label.includes('build')) { return 'package'; }
        if (label.includes('test')) { return 'beaker'; }
        if (label.includes('launch')) { return 'rocket'; }
        if (label.includes('terminal')) { return 'terminal'; }
        if (label.includes('debug')) { return 'bug'; }
        if (label.includes('watch')) { return 'eye'; }
        if (label.includes('clean')) { return 'trash'; }
        if (label.includes('deploy')) { return 'cloud-upload'; }
        if (label.includes('start')) { return 'play'; }
        if (label.includes('stop')) { return 'stop'; }
        return 'gear'; // default icon
    }

    private getColorFromTaskType(taskType: string): string {
        if (taskType.includes('npm')) { return 'charts.red'; }
        if (taskType.includes('shell')) { return 'charts.blue'; }
        if (taskType.includes('typescript')) { return 'charts.purple'; }
        if (taskType.includes('gulp')) { return 'charts.orange'; }
        if (taskType.includes('grunt')) { return 'charts.yellow'; }
        return 'foreground'; // default white color
    }
}
