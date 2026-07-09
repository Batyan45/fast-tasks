import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

interface TaskConfigDefinition {
    label?: string;
    taskName?: string;
    icon?: { id?: string; color?: string };
    hide?: boolean;
}

/**
 * Extracts the array of task definitions from a "tasks" configuration value,
 * which may be either an object ({ version, tasks: [...] }) or a legacy array.
 */
export function extractTaskDefinitions(value: unknown): TaskConfigDefinition[] {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.filter((t): t is TaskConfigDefinition => typeof t === 'object' && t !== null);
    }
    if (typeof value === 'object') {
        const tasks = (value as { tasks?: unknown }).tasks;
        if (Array.isArray(tasks)) {
            return tasks.filter((t): t is TaskConfigDefinition => typeof t === 'object' && t !== null);
        }
    }
    return [];
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
    private hiddenTaskSet: Set<string> = new Set();

    constructor(
        private readonly workspaceState: vscode.Memento,
        private readonly globalStorageUri?: vscode.Uri
    ) {
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
            this.hiddenTaskSet.clear();

            // Icons and hide flags come from the configuration model: VS Code itself
            // resolves user tasks.json, the "tasks" section of settings.json and
            // .code-workspace files for any installation, profile or remote.
            const inspected = vscode.workspace.getConfiguration().inspect('tasks');
            this.processTaskDefinitions(inspected?.globalValue);
            this.processTaskDefinitions(inspected?.workspaceValue);

            // Locations (line numbers for the edit command) still require parsing files
            if (vscode.workspace.workspaceFolders) {
                for (const folder of vscode.workspace.workspaceFolders) {
                    const folderConfig = vscode.workspace.getConfiguration(undefined, folder.uri).inspect('tasks');
                    this.processTaskDefinitions(folderConfig?.workspaceFolderValue, folder.name);

                    // Check in .vscode folder
                    const vscodeFolderPath = path.join(folder.uri.fsPath, '.vscode', 'tasks.json');
                    // Check in root folder
                    const rootFolderPath = path.join(folder.uri.fsPath, 'tasks.json');

                    if (fs.existsSync(vscodeFolderPath)) {
                        this.loadLocationsFromTasksFile(vscodeFolderPath);
                    }

                    if (fs.existsSync(rootFolderPath)) {
                        this.loadLocationsFromTasksFile(rootFolderPath);
                    }
                }
            }

            // Check for .code-workspace file
            if (vscode.workspace.workspaceFile && vscode.workspace.workspaceFile.scheme === 'file') {
                const workspaceFilePath = vscode.workspace.workspaceFile.fsPath;
                if (workspaceFilePath.endsWith('.code-workspace') && fs.existsSync(workspaceFilePath)) {
                    this.loadLocationsFromWorkspaceFile(workspaceFilePath);
                }
            }

            // Check for User tasks.json (default profile and all named profiles)
            for (const userTasksPath of this.getUserTasksPaths()) {
                this.loadLocationsFromTasksFile(userTasksPath, true);
            }
        } catch (error) {
            console.error('Error loading custom icons:', error);
        }
    }

    /**
     * The configuration model may not have finished loading when the provider was
     * constructed (user tasks.json can arrive late on slow startups and VS Code
     * forks), leaving every map empty. Retry on render while that is the case;
     * becomes a no-op as soon as anything has been loaded.
     */
    private ensureCustomIconsLoaded(): void {
        if (this.taskIconMap.size === 0 &&
            this.taskLocationMap.size === 0 &&
            this.hiddenTaskSet.size === 0) {
            this.loadCustomIcons();
        }
    }

    /** Fills the icon map and hidden set from a "tasks" configuration value. */
    private processTaskDefinitions(value: unknown, workspaceName?: string): void {
        for (const taskDef of extractTaskDefinitions(value)) {
            const label = taskDef.label ?? taskDef.taskName;
            if (typeof label !== 'string' || !label) {
                continue;
            }

            const mapKey = workspaceName ? `${workspaceName}:${label}` : label;

            if (taskDef.icon && typeof taskDef.icon === 'object' && typeof taskDef.icon.id === 'string') {
                const icon: CustomIcon = {
                    id: taskDef.icon.id,
                    color: typeof taskDef.icon.color === 'string' ? taskDef.icon.color : undefined
                };
                this.taskIconMap.set(mapKey, icon);
                // Also set with just the task name as fallback
                this.taskIconMap.set(label, icon);
            }

            if (taskDef.hide === true) {
                this.hiddenTaskSet.add(mapKey);
                this.hiddenTaskSet.add(label);
            }
        }
    }

    private getUserTasksPaths(): string[] {
        const candidates: string[] = [];
        try {
            // Derive the User directory from global storage:
            // <userDataDir>/User/globalStorage/<extensionId> -> <userDataDir>/User.
            // This works for any installation (stable/Insiders/VSCodium), portable
            // mode and remote setups.
            if (this.globalStorageUri?.scheme === 'file') {
                const userDir = path.resolve(this.globalStorageUri.fsPath, '..', '..');
                candidates.push(path.join(userDir, 'tasks.json'));

                // globalStorageUri always points at the default profile (vscode#160466),
                // so scan named profile directories as well
                const profilesDir = path.join(userDir, 'profiles');
                if (fs.existsSync(profilesDir)) {
                    for (const entry of fs.readdirSync(profilesDir)) {
                        candidates.push(path.join(profilesDir, entry, 'tasks.json'));
                    }
                }
            }

            // Fallback to well-known paths
            const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
            candidates.push(
                path.join(appData, 'Code', 'User', 'tasks.json'),
                path.join(appData, 'Code - Insiders', 'User', 'tasks.json'),
                path.join(appData, 'Code - OSS', 'User', 'tasks.json')
            );
        } catch (e) {
            console.error('Error determining user tasks path:', e);
        }
        return [...new Set(candidates)].filter(p => fs.existsSync(p));
    }

    private loadLocationsFromWorkspaceFile(filePath: string): void {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const tree = JSONC.parseTree(content);
            if (!tree) { return; }

            // 1. Standard "tasks" property at root
            const tasksNode = JSONC.findNodeAtLocation(tree, ['tasks']);
            if (tasksNode) {
                // Check if it's the tasks object (version 2.0.0) or array (legacy)
                const tasksArray = JSONC.findNodeAtLocation(tasksNode, ['tasks']);
                if (tasksArray) {
                    this.processTasksNode(tasksArray, content, filePath, undefined);
                } else if (tasksNode.type === 'array') {
                    // Legacy support where "tasks" is directly an array
                    this.processTasksNode(tasksNode, content, filePath, undefined);
                }
            }

            // 2. "settings" -> "tasks" property (User specified case)
            const settingsTasksNode = JSONC.findNodeAtLocation(tree, ['settings', 'tasks']);
            if (settingsTasksNode) {
                // The structure inside settings.tasks might be { "tasks": [...] } or just the array/object directly?
                // Based on user example: "settings": { "tasks": { "version": "2.0.0", "tasks": [...] } }
                // So we need to look for "tasks" inside "settings.tasks"
                const innerTasksNode = JSONC.findNodeAtLocation(settingsTasksNode, ['tasks']);
                if (innerTasksNode) {
                    this.processTasksNode(innerTasksNode, content, filePath, undefined);
                }
            }

        } catch (error) {
            console.error(`Error loading task locations from workspace file ${filePath}:`, error);
        }
    }

    private processTasksNode(tasksArrayNode: JSONC.Node, content: string, filePath: string, workspaceName: string | undefined) {
        if (!tasksArrayNode.children) { return; }

        tasksArrayNode.children.forEach(taskNode => {
            const taskDef = JSONC.getNodeValue(taskNode);
            if (!taskDef) { return; }

            const label = taskDef.label ?? taskDef.taskName;
            if (!label) { return; }

            // Handle Location Mapping
            const labelNode = JSONC.findNodeAtLocation(taskNode, ['label']) ||
                JSONC.findNodeAtLocation(taskNode, ['taskName']);
            const offset = labelNode ? labelNode.offset : taskNode.offset;
            const line = content.slice(0, offset).split(/\r?\n/).length - 1;

            const mapKey = workspaceName ? `${workspaceName}:${label}` : label;
            this.taskLocationMap.set(mapKey, { filePath, line });
            this.taskLocationMap.set(label, { filePath, line });
        });
    }

    private loadLocationsFromTasksFile(filePath: string, isUserTask: boolean = false): void {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const tree = JSONC.parseTree(content);
            const tasksArrayNode = tree ? JSONC.findNodeAtLocation(tree, ['tasks']) : undefined;

            // Get the workspace folder this tasks.json belongs to
            let workspaceName: string | undefined;
            if (!isUserTask) {
                const workspaceFolder = vscode.workspace.workspaceFolders?.find(folder =>
                    filePath.startsWith(folder.uri.fsPath)
                );
                workspaceName = workspaceFolder?.name;
            }

            if (tasksArrayNode) {
                this.processTasksNode(tasksArrayNode, content, filePath, workspaceName);
            }
        } catch (error) {
            console.error(`Error loading task locations from ${filePath}:`, error);
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
                task.source === 'User' ||
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
        const ignoreHide = this.isIgnoreHideEnabled();
        const allTasksRaw = await this.getAllAvailableTasks();
        const allTasks = ignoreHide ? allTasksRaw : allTasksRaw.filter(t => !this.isTaskHidden(t));
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

        if (!element) {
            this.ensureCustomIconsLoaded();
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
            const workspaceScopedTasks = tasks.filter(task => typeof task.scope === 'number');
            const foldersWithTasks = vscode.workspace.workspaceFolders.filter(folder =>
                tasks.some(task => {
                    const scope = task.scope as vscode.WorkspaceFolder;
                    return scope?.name === folder.name;
                })
            );
            return [
                ...workspaceScopedTasks.map(task => this.createTaskItem(task)),
                ...foldersWithTasks.map(folder => new WorkspaceItem(folder)),
            ];
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

    private isIgnoreHideEnabled(): boolean {
        try {
            const config = vscode.workspace.getConfiguration('fast-tasks');
            return config.get<boolean>('ignoreHide', false);
        } catch {
            return false;
        }
    }

    private async getConfiguredTasks(): Promise<vscode.Task[]> {
        const ignoreHide = this.isIgnoreHideEnabled();
        const tasksRaw = await this.getAllAvailableTasks();

        // Apply hide filtering unless ignored
        const tasks = ignoreHide ? tasksRaw : tasksRaw.filter(task => !this.isTaskHidden(task));

        return tasks.filter(task => {
            if (this.selectedTasks.length === 0) {
                return true;
            }
            const key = this.getTaskKey(task);
            return this.selectedTasks.includes(key) || this.selectedTasks.includes(task.name);
        });
    }

    private isTaskHidden(task: vscode.Task): boolean {
        let workspaceName = '';
        if (task.scope && typeof task.scope === 'object' && 'name' in task.scope) {
            workspaceName = (task.scope as vscode.WorkspaceFolder).name;
        }
        const key = workspaceName ? `${workspaceName}:${task.name}` : task.name;
        return this.hiddenTaskSet.has(key) || this.hiddenTaskSet.has(task.name);
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
        const execution = taskStatus?.execution;

        if (!execution) {
            return;
        }

        // Prefer a "soft" stop to preserve terminal output: send Ctrl+C to the task terminal
        try {
            // VS Code API <1.92 doesn't expose TaskExecution.terminal in types
            const term = (execution as any).terminal as vscode.Terminal | undefined;
            if (term) {
                term.sendText('\x03', false); // Ctrl+C without adding a newline
                return;
            }
        } catch (err) {
            console.error('Soft stop failed, falling back to terminate():', err);
        }

        // Fallback if no terminal is available or soft stop failed
        try {
            await execution.terminate();
        } catch (err) {
            console.error('Failed to terminate task execution:', err);
        }
    }

    // Execute a task; if already running, first attempt a soft stop (Ctrl+C) to keep the terminal open
    async runTask(task: vscode.Task): Promise<void> {
        try {
            const key = this.getTaskKey(task);
            const status = this.taskStatusMap.get(key) ?? this.taskStatusMap.get(task.name);

            if (status?.isActive && status.execution) {
                try {
                    const term = (status.execution as any).terminal as vscode.Terminal | undefined;
                    term?.sendText('\x03', false);
                } catch (err) {
                    console.error('Soft stop on re-run failed:', err);
                    // As a last resort, terminate; this may close the terminal, but we avoid hanging
                    try { await status.execution.terminate(); } catch {}
                }

                // Wait briefly for the process to end to avoid VS Code's restart-kill prompt
                await new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => {
                        endDisposable.dispose();
                        resolve();
                    }, 2000);

                    const endDisposable = vscode.tasks.onDidEndTaskProcess(e => {
                        if (e.execution === status.execution) {
                            clearTimeout(timeout);
                            endDisposable.dispose();
                            resolve();
                        }
                    });
                });
            }

            await vscode.tasks.executeTask(task);
        } catch (error) {
            console.error('Failed to execute task:', error);
            void vscode.window.showErrorMessage('Failed to execute task');
        }
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
            // For User tasks we may not know the file path (e.g. non-default profile);
            // let VS Code open the user tasks file itself
            if (item.task?.source === 'User') {
                await vscode.commands.executeCommand('workbench.action.tasks.openUserTasks');
                return;
            }
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

    private static readonly iconKeys = Object.keys(TASK_ICONS).filter(k => k !== 'default');
    private static readonly iconRegex = new RegExp(TaskItem.iconKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    private static readonly iconPriorityMap = new Map(TaskItem.iconKeys.map((key, index) => [key, index]));

    private static readonly colorKeys = Object.keys(TASK_COLORS).filter(k => k !== 'default');
    private static readonly colorRegex = new RegExp(TaskItem.colorKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    private static readonly colorPriorityMap = new Map(TaskItem.colorKeys.map((key, index) => [key, index]));

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

    private static getBestMatch(
        text: string,
        map: Map<string, string>,
        keys: string[],
        regex: RegExp,
        priorityMap: Map<string, number>,
        defaultValue: string
    ): string {
        // 1. O(1) exact match lookup
        const exactMatch = map.get(text);
        if (exactMatch) {
            return exactMatch;
        }

        // 2. Efficient partial match using regex
        const matches = text.match(regex);
        if (matches) {
            let bestIndex = Infinity;
            for (const match of matches) {
                const index = priorityMap.get(match);
                if (index !== undefined && index < bestIndex) {
                    bestIndex = index;
                }
                if (bestIndex === 0) break;
            }

            if (bestIndex !== Infinity) {
                return map.get(keys[bestIndex]) || defaultValue;
            }
        }

        return defaultValue;
    }

    private getIconNameFromLabel(label: string): string {
        return TaskItem.getBestMatch(
            label,
            TaskItem.iconMap,
            TaskItem.iconKeys,
            TaskItem.iconRegex,
            TaskItem.iconPriorityMap,
            TASK_ICONS.default
        );
    }

    private getColorFromTaskType(taskType: string): string {
        return TaskItem.getBestMatch(
            taskType,
            TaskItem.colorMap,
            TaskItem.colorKeys,
            TaskItem.colorRegex,
            TaskItem.colorPriorityMap,
            TASK_COLORS.default
        );
    }
}

export class WorkspaceItem extends vscode.TreeItem {
    constructor(public readonly folder: vscode.WorkspaceFolder) {
        super(folder.name, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'workspace';
    }
}
