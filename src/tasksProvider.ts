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

// Improved type safety with literal types
type TaskIconType = keyof typeof TASK_ICONS;
type TaskColorType = keyof typeof TASK_COLORS;

// Cache timeout in milliseconds
const CACHE_TIMEOUT = 5000;

export class TasksProvider implements vscode.TreeDataProvider<TaskItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private readonly taskStatusMap = new Map<string, TaskStatus>();
    private selectedTasks: string[] = [];
    private taskCache: { tasks: vscode.Task[]; timestamp: number } | null = null;

    constructor(private readonly workspaceState: vscode.Memento) {
        this.selectedTasks = this.workspaceState.get('selectedTasks', []);
        this.initializeTaskListeners();
    }

    private initializeTaskListeners(): void {
        try {
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
                        status: e.exitCode === 0 ? 'Success' : `Failed (${e.exitCode})`
                    });
                    this.refresh();
                }
            });
        } catch (error) {
            console.error('Failed to initialize task listeners:', error);
            void vscode.window.showErrorMessage('Failed to initialize task listeners');
        }
    }

    private async getAllAvailableTasks(): Promise<vscode.Task[]> {
        try {
            // Check cache first
            if (this.taskCache && Date.now() - this.taskCache.timestamp < CACHE_TIMEOUT) {
                return this.taskCache.tasks;
            }

            const tasks = await vscode.tasks.fetchTasks();
            const filteredTasks = tasks.filter(task => 
                task.source === 'Workspace' || 
                (task as any)._source?.kind === 2
            );

            // Update cache
            this.taskCache = {
                tasks: filteredTasks,
                timestamp: Date.now()
            };

            return filteredTasks;
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
            return [];
        }
    }

    async selectTasks(): Promise<void> {
        const allTasks = await this.getAllAvailableTasks();
        const taskItems = allTasks.map(task => ({
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
        const tasks = await this.getAllAvailableTasks();
        return tasks.filter(task => 
            this.selectedTasks.length === 0 || 
            this.selectedTasks.includes(task.name)
        );
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
    // Map for faster icon lookup
    private static readonly iconMap = new Map(
        Object.entries(TASK_ICONS).map(([key, value]) => [key, value])
    );

    // Map for faster color lookup
    private static readonly colorMap = new Map(
        Object.entries(TASK_COLORS).map(([key, value]) => [key, value])
    );

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
        try {
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
        } catch (error) {
            console.error('Failed to create tooltip:', error);
            return new vscode.MarkdownString(`Task: ${this.label}`);
        }
    }

    private getIconNameFromLabel(label: string): string {
        // Use Map for O(1) lookup instead of multiple if statements
        for (const [key, value] of TaskItem.iconMap) {
            if (label.includes(key)) {
                return value;
            }
        }
        return TASK_ICONS.default;
    }

    private getColorFromTaskType(taskType: string): string {
        // Use Map for O(1) lookup instead of multiple if statements
        for (const [key, value] of TaskItem.colorMap) {
            if (taskType.includes(key)) {
                return value;
            }
        }
        return TASK_COLORS.default;
    }
}
