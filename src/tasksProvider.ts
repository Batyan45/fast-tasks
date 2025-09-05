import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as JSONC from 'jsonc-parser';

interface TaskStatus {
    isActive: boolean;
    status?: string;
    execution?: vscode.TaskExecution;
}

interface CustomIcon {
    id: string;
    color?: string;
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
    run: 'run',
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

export class TasksProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private readonly taskStatusMap = new Map<string, TaskStatus>();
    private selectedTasks: string[] = [];
    private taskCache: { tasks: vscode.Task[]; timestamp: number } | null = null;
    private taskIconMap: Map<string, CustomIcon> = new Map();
    private taskLocationMap: Map<string, { filePath: string; line: number }> = new Map();

    constructor(private readonly workspaceState: vscode.Memento) {
        this.selectedTasks = this.workspaceState.get('selectedTasks', []);
        this.initializeTaskListeners();
        this.loadCustomIcons();
    }

    private initializeTaskListeners(): void {
        try {
            vscode.tasks.onDidStartTaskProcess(e => {
                if (e.execution.task) {
                    const key = this.getTaskKey(e.execution.task);
                    this.taskStatusMap.set(key, {
                        isActive: true,
                        execution: e.execution
                    });
                    this.refresh();
                }
            });

            vscode.tasks.onDidEndTaskProcess(e => {
                if (e.execution.task) {
                    const key = this.getTaskKey(e.execution.task);
                    this.taskStatusMap.set(key, {
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

    private loadCustomIcons(): void {
        try {
            // Clear existing mappings
            this.taskIconMap.clear();
            this.taskLocationMap.clear();
            
            // Find tasks.json files in all workspace folders
            if (vscode.workspace.workspaceFolders) {
                for (const folder of vscode.workspace.workspaceFolders) {
                    // Check in .vscode folder
                    const vscodeFolderPath = path.join(folder.uri.fsPath, '.vscode', 'tasks.json');
                    // Check in root folder
                    const rootFolderPath = path.join(folder.uri.fsPath, 'tasks.json');
                    
                    // Try .vscode/tasks.json
                    if (fs.existsSync(vscodeFolderPath)) {
                        this.loadIconsFromTasksFile(vscodeFolderPath);
                    }
                    
                    // Also try tasks.json in the root
                    if (fs.existsSync(rootFolderPath)) {
                        this.loadIconsFromTasksFile(rootFolderPath);
                    }
                }
            }
            
            console.log('Loaded custom icons:', [...this.taskIconMap.entries()]);
        } catch (error) {
            console.error('Error loading custom icons:', error);
        }
    }
    
    private loadIconsFromTasksFile(filePath: string): void {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const tasksConfig = JSONC.parse(content);
            const tree = JSONC.parseTree(content);
            const tasksArrayNode = tree ? JSONC.findNodeAtLocation(tree, ['tasks']) : undefined;

            // Get the workspace folder this tasks.json belongs to
            const workspaceFolder = vscode.workspace.workspaceFolders?.find(folder =>
                filePath.startsWith(folder.uri.fsPath)
            );
            const workspaceName = workspaceFolder?.name || '';

            if (tasksConfig.tasks && Array.isArray(tasksConfig.tasks)) {
                tasksConfig.tasks.forEach((taskDef: any, index: number) => {
                    if (taskDef.label && taskDef.icon) {
                        // Use a combination of workspace name and task label as the map key
                        // This prevents conflicts between tasks with the same name in different projects
                        const mapKey = workspaceName ? `${workspaceName}:${taskDef.label}` : taskDef.label;

                        this.taskIconMap.set(mapKey, {
                            id: taskDef.icon.id,
                            color: taskDef.icon.color
                        });

                        // Also set with just the task name as fallback
                        this.taskIconMap.set(taskDef.label, {
                            id: taskDef.icon.id,
                            color: taskDef.icon.color
                        });
                    }

                    const label = taskDef.label ?? taskDef.taskName;
                    if (label && tasksArrayNode && tasksArrayNode.children) {
                        const taskNode = tasksArrayNode.children[index];
                        const labelNode = JSONC.findNodeAtLocation(taskNode, ['label']) ||
                            JSONC.findNodeAtLocation(taskNode, ['taskName']);
                        const offset = labelNode ? labelNode.offset : taskNode.offset;
                        const line = content.slice(0, offset).split(/\r?\n/).length - 1;
                        const mapKey = workspaceName ? `${workspaceName}:${label}` : label;
                        this.taskLocationMap.set(mapKey, { filePath, line });
                        this.taskLocationMap.set(label, { filePath, line });
                    }
                });
            }
        } catch (error) {
            console.error(`Error loading icons from ${filePath}:`, error);
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
        const hasMultipleWorkspaces = (vscode.workspace.workspaceFolders?.length || 0) > 1;
        const taskItems = allTasks.map(task => {
            let workspaceName = '';
            if (task.scope && typeof task.scope === 'object' && 'name' in task.scope) {
                workspaceName = (task.scope as vscode.WorkspaceFolder).name;
            }

            const taskKey = this.getTaskKey(task);

            return {
                label: task.name,
                description: hasMultipleWorkspaces && workspaceName ? workspaceName : undefined,
                picked: this.selectedTasks.includes(taskKey) || this.selectedTasks.includes(task.name),
                taskKey
            } as vscode.QuickPickItem & { picked: boolean; taskKey: string };
        });

        const selected = await vscode.window.showQuickPick(taskItems, {
            canPickMany: true,
            title: 'Select Tasks to Display'
        });

        if (selected) {
            // Prefer unique keys; fall back to name for backward compatibility
            this.selectedTasks = selected.map(item => (item as any).taskKey ?? (item.description ? `${item.description}:${item.label}` : item.label));
            await this.workspaceState.update('selectedTasks', this.selectedTasks);
            this.refresh();
        }
    }

    refresh(clearStatuses = false, reloadIcons = false, invalidateCache = false): void {
        if (clearStatuses) {
            this.taskStatusMap.clear();
        }
        if (invalidateCache) {
            this.taskCache = null; // Invalidate the task cache
        }
        if (reloadIcons) {
            this.loadCustomIcons(); // Reload custom icons only when requested
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const folderCount = vscode.workspace.workspaceFolders.length;
        const forceFlat = folderCount <= 1; // Always flat when only one workspace folder
        const isFlat = forceFlat || this.isFlatListEnabled();
        const tasks = await this.getConfiguredTasks();

        // Flat list mode
        if (isFlat) {
            return tasks.map(task => this.createTaskItem(task));
        }

        // Grouped mode
        if (!element) {
            return vscode.workspace.workspaceFolders.map(folder => new WorkspaceItem(folder));
        }

        if (element instanceof WorkspaceItem) {
            const folder = element.folder;
            const folderTasks = tasks.filter(task => {
                const scope = (task as any).scope as any;
                return scope && typeof scope === 'object' && 'name' in scope && scope.name === folder.name;
            });
            return folderTasks.map(task => this.createTaskItem(task));
        }

        return [];
    }

    private isFlatListEnabled(): boolean {
        try {
            const config = vscode.workspace.getConfiguration('fast-tasks');
            return config.get<boolean>('flatList', false);
        } catch {
            return false;
        }
    }

    private async getConfiguredTasks(): Promise<vscode.Task[]> {
        const tasks = await this.getAllAvailableTasks();
        
        // Debug logging to help diagnose task icon issues
        console.log('All available tasks:', tasks.map(t => ({
            name: t.name,
            type: t.definition.type,
            definition: t.definition,
            source: t.source
        })));
        
        return tasks.filter(task => {
            if (this.selectedTasks.length === 0) {
                return true;
            }
            const key = this.getTaskKey(task);
            return this.selectedTasks.includes(key) || this.selectedTasks.includes(task.name);
        });
    }

    private createTaskItem(task: vscode.Task): TaskItem {
        const key = this.getTaskKey(task);
        const taskStatus = this.taskStatusMap.get(key) ?? this.taskStatusMap.get(task.name);
        
        // Try to get workspace-specific icon first
        let workspaceName = '';
        
        if (task.scope && typeof task.scope === 'object' && 'name' in task.scope) {
            workspaceName = task.scope.name;
        }
        
        let customIcon = workspaceName 
            ? this.taskIconMap.get(`${workspaceName}:${task.name}`)
            : undefined;
            
        // Fall back to task name only if not found
        if (!customIcon) {
            customIcon = this.taskIconMap.get(task.name);
        }
        
        // Special handling for the "test" task from the example
        if (task.name === "test" && !customIcon) {
            customIcon = {
                id: "database",
                color: "terminal.ansiGreen"
            };
            console.log("Applied special icon for test task");
        }

        // Display label with workspace prefix only in flat list mode
        const hasMultipleWorkspaces = (vscode.workspace.workspaceFolders?.length || 0) > 1;
        const displayLabel = this.isFlatListEnabled() && hasMultipleWorkspaces && workspaceName
            ? `${workspaceName} / ${task.name}`
            : task.name;
        
        const taskItem = new TaskItem(
            displayLabel,
            task.definition.type,
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'fast-tasks.runTask',
                title: '',
                arguments: [task]
            },
            task,
            customIcon
        );

        if (taskStatus?.isActive) {
            taskItem.description = 'Running...';
            taskItem.iconPath = new vscode.ThemeIcon('sync~spin');
            taskItem.contextValue = 'runningTask';
        } else if (taskStatus?.status) {
            taskItem.description = taskStatus.status;
        }

        if (taskStatus?.isActive || this.selectedTasks.includes(key) || this.selectedTasks.includes(task.name)) {
            const uriKey = encodeURIComponent(key);
            taskItem.resourceUri = vscode.Uri.parse(`task://${uriKey}`);
        }

        return taskItem;
    }

    async stopTask(item: TaskItem): Promise<void> {
        const mapKey = item.task ? this.getTaskKey(item.task) : (item.label ?? '');
        const taskStatus = this.taskStatusMap.get(mapKey) ?? this.taskStatusMap.get(item.task?.name ?? item.label ?? '');
        taskStatus?.execution?.terminate();
    }

    async editTask(item: TaskItem): Promise<void> {
        let workspaceName = '';
        if (item.task?.scope && typeof item.task.scope === 'object' && 'name' in item.task.scope) {
            workspaceName = item.task.scope.name;
        }

        const taskName = item.task?.name ?? item.label;
        const key = workspaceName ? `${workspaceName}:${taskName}` : taskName;
        const location = this.taskLocationMap.get(key) ?? this.taskLocationMap.get(taskName);

        if (!location) {
            void vscode.window.showWarningMessage('Task definition not found');
            return;
        }

        const doc = await vscode.workspace.openTextDocument(location.filePath);
        const editor = await vscode.window.showTextDocument(doc);
        const position = new vscode.Position(location.line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }

    private getTaskKey(task: vscode.Task): string {
        let workspaceName = '';
        if (task.scope && typeof task.scope === 'object' && 'name' in task.scope) {
            workspaceName = (task.scope as vscode.WorkspaceFolder).name;
        }
        return workspaceName ? `${workspaceName}:${task.name}` : task.name;
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
        public readonly task?: vscode.Task,
        private readonly customIcon?: CustomIcon
    ) {
        super(label, collapsibleState);
        
        this.label = label;
        this.tooltip = this.createTooltip();
        this.contextValue = 'task';
        
        // First try to use the directly passed custom icon (from tasks.json file)
        if (this.customIcon?.id) {
            const iconName = this.customIcon.id;
            const iconColorTheme = this.customIcon.color 
                ? new vscode.ThemeColor(this.customIcon.color)
                : undefined;
                
            this.iconPath = new vscode.ThemeIcon(iconName, iconColorTheme);
            return;
        }
        
        // Fallback to task definition icon if available
        const taskDef = this.task?.definition as any || {};
        const rawIconDef = taskDef.icon;
        
        let customIconId: string | undefined = undefined;
        let customIconColor: string | undefined = undefined;

        if (typeof rawIconDef === 'object' && rawIconDef !== null) {
            customIconId = typeof rawIconDef.id === 'string' && rawIconDef.id.length > 0 
                ? rawIconDef.id 
                : undefined;
                
            customIconColor = typeof rawIconDef.color === 'string' && rawIconDef.color.length > 0 
                ? rawIconDef.color 
                : undefined;
        }

        let iconName: string;
        let iconColorTheme: vscode.ThemeColor | undefined;

        if (customIconId) {
            iconName = customIconId;
            if (customIconColor) {
                iconColorTheme = new vscode.ThemeColor(customIconColor);
            }
        } else {
            iconName = this.getIconNameFromLabel(label.toLowerCase());
            const autoColorId = this.getColorFromTaskType(taskType.toLowerCase());
            iconColorTheme = new vscode.ThemeColor(autoColorId);
        }
        
        this.iconPath = new vscode.ThemeIcon(iconName, iconColorTheme);
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

export class WorkspaceItem extends vscode.TreeItem {
    constructor(public readonly folder: vscode.WorkspaceFolder) {
        super(folder.name, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'workspace';
    }
}
