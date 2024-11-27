import * as vscode from 'vscode';

interface TaskStatus {
    isActive: boolean;
    status?: string;
    execution?: vscode.TaskExecution;
}

const TASK_ICONS = {
    debug: 'bug',
    build: 'package',
    test: 'beaker',
    launch: 'rocket',
    terminal: 'terminal',
    watch: 'eye',
    clean: 'trash',
    deploy: 'cloud-upload',
    start: 'play',
    stop: 'stop',
    publish: 'cloud',
    default: 'gear'
} as const;

const TASK_COLORS = {
    npm: 'charts.red',
    shell: 'charts.blue',
    typescript: 'charts.purple',
    gulp: 'charts.orange',
    grunt: 'charts.yellow',
    default: 'charts.yellow'
} as const;

export class TasksProvider implements vscode.TreeDataProvider<TaskItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private readonly taskStatusMap = new Map<string, TaskStatus>();
    private selectedTasks: string[] = [];

    constructor(private readonly workspaceState: vscode.Memento) {
        this.selectedTasks = this.workspaceState.get('selectedTasks', []);
        this.initializeTaskListeners();
    }

    private initializeTaskListeners(): void {
        vscode.tasks.onDidStartTaskProcess(e => {
            if (e.execution.task) {
                const { name } = e.execution.task;
                this.taskStatusMap.set(name, {
                    isActive: true,
                    execution: e.execution
                });
                this.refresh();
            }
        });

        vscode.tasks.onDidEndTaskProcess(e => {
            if (e.execution.task) {
                const { name } = e.execution.task;
                this.taskStatusMap.set(name, {
                    isActive: false,
                    status: e.exitCode === 0 ? 'Success' : 'Failed'
                });
                this.refresh();
            }
        });
    }

    async selectTasks(): Promise<void> {
        const tasks = await this.getConfiguredTasks();
        const taskItems = tasks.map(task => ({
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

    refresh(clearStatuses = false): void {
        if (clearStatuses) {
            this.taskStatusMap.clear();
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TaskItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<TaskItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const tasks = await this.getConfiguredTasks();
        return tasks.map(task => this.createTaskItem(task));
    }

    private async getConfiguredTasks(): Promise<vscode.Task[]> {
        const tasks = await vscode.tasks.fetchTasks();
        return tasks.filter(task => {
            const isConfigured = task.source === 'Workspace' || 
                               (task as any)._source?.kind === 2;
            return isConfigured && 
                   (this.selectedTasks.length === 0 || 
                    this.selectedTasks.includes(task.name));
        });
    }

    private createTaskItem(task: vscode.Task): TaskItem {
        const taskStatus = this.taskStatusMap.get(task.name);
        const taskItem = new TaskItem(
            task.name,
            task.definition.type,
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'workbench.action.tasks.runTask',
                title: '',
                arguments: [task.name]
            },
            task
        );

        if (taskStatus?.isActive) {
            taskItem.description = 'Running...';
            taskItem.iconPath = new vscode.ThemeIcon('sync~spin');
            taskItem.contextValue = 'runningTask';
        } else if (taskStatus?.status) {
            taskItem.description = taskStatus.status;
        }

        if (taskStatus?.isActive || this.selectedTasks.includes(task.name)) {
            taskItem.resourceUri = vscode.Uri.parse(`task://${task.name}`);
        }

        return taskItem;
    }

    async stopTask(item: TaskItem): Promise<void> {
        const taskStatus = this.taskStatusMap.get(item.label);
        taskStatus?.execution?.terminate();
    }
}

export class TaskItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly taskType: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        private readonly task?: vscode.Task
    ) {
        super(label, collapsibleState);
        
        this.label = label;
        this.tooltip = this.createTooltip();
        this.contextValue = 'task';
        
        const iconName = this.getIconNameFromLabel(label.toLowerCase());
        const iconColor = this.getColorFromTaskType(taskType.toLowerCase());
        
        this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(iconColor));
    }

    private createTooltip(): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString('', true);
        tooltip.isTrusted = true;
        tooltip.supportHtml = true;

        tooltip.appendMarkdown(`**Task:** ${this.label}\n\n`);
        tooltip.appendMarkdown(`**Type:** ${this.taskType}\n\n`);

        if (this.task?.detail) {
            tooltip.appendMarkdown(`**Detail:** ${this.task.detail}\n\n`);
        }

        if (this.task?.execution) {
            if ('commandLine' in this.task.execution) {
                tooltip.appendMarkdown(`**Command:**\n\`\`\`shell\n${this.task.execution.commandLine}\n\`\`\`\n`);
            } else if ('args' in this.task.execution) {
                tooltip.appendMarkdown(`**Arguments:** ${this.task.execution.args?.join(' ') || ''}\n\n`);
            }
        }

        return tooltip;
    }

    private getIconNameFromLabel(label: string): string {
        if (label.includes('debug')) { return TASK_ICONS.debug; }
        if (label.includes('build')) { return TASK_ICONS.build; }
        if (label.includes('test')) { return TASK_ICONS.test; }
        if (label.includes('launch')) { return TASK_ICONS.launch; }
        if (label.includes('terminal')) { return TASK_ICONS.terminal; }
        if (label.includes('watch')) { return TASK_ICONS.watch; }
        if (label.includes('clean')) { return TASK_ICONS.clean; }
        if (label.includes('deploy')) { return TASK_ICONS.deploy; }
        if (label.includes('start')) { return TASK_ICONS.start; }
        if (label.includes('stop')) { return TASK_ICONS.stop; }
        if (label.includes('publish')) { return TASK_ICONS.publish; }
        return TASK_ICONS.default; // default icon
    }

    private getColorFromTaskType(taskType: string): string {
        if (taskType.includes('npm')) { return TASK_COLORS.npm; }
        if (taskType.includes('shell')) { return TASK_COLORS.shell; }
        if (taskType.includes('typescript')) { return TASK_COLORS.typescript; }
        if (taskType.includes('gulp')) { return TASK_COLORS.gulp; }
        if (taskType.includes('grunt')) { return TASK_COLORS.grunt; }
        return TASK_COLORS.default; // default color
    }
}
