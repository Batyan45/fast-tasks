import * as vscode from 'vscode';
import * as JSONC from 'jsonc-parser';
import { AdditionalTaskSchemas } from './additionalTaskSchemas';

interface TaskDefinition extends vscode.TaskDefinition {
    label?: string;
    taskName?: string;
    command?: string;
    args?: (string | vscode.ShellQuotedString)[];
    options?: vscode.ShellExecutionOptions;
    icon?: { id?: string; color?: string };
    hide?: boolean;
    dependsOn?: string | string[];
    dependsOrder?: string;
}

export interface AdditionalTaskInfo {
    uri: vscode.Uri;
    line: number;
    id: string;
    definition: TaskDefinition;
}

const DEFAULT_PATTERNS = ['.vscode/tasks-*.json'];

export class AdditionalTasks implements vscode.Disposable {
    private readonly watchers: vscode.Disposable[] = [];
    private readonly subscriptions: vscode.Disposable[] = [];
    private readonly taskInfo = new WeakMap<vscode.Task, AdditionalTaskInfo>();
    private readonly definitions = new Map<string, AdditionalTaskInfo>();

    constructor(private readonly onChange: () => void) {
        this.watchFiles();
        this.subscriptions.push(
            new AdditionalTaskSchemas(folder => this.getPatterns(folder)),
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.watchFiles();
                this.onChange();
            }),
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('fast-tasks.includeAdditionalTasksFiles')) {
                    this.watchFiles();
                    this.onChange();
                }
            })
        );
    }

    dispose(): void {
        [...this.watchers, ...this.subscriptions].forEach(disposable => disposable.dispose());
    }

    getInfo(task: vscode.Task): AdditionalTaskInfo | undefined {
        return this.taskInfo.get(task) ?? this.definitions.get(this.definitionKey(task));
    }

    private definitionKey(task: vscode.Task): string {
        const scope = typeof task.scope === 'object' ? task.scope.uri.toString() : task.scope;
        return JSON.stringify([scope, task.definition.type, task.definition.file, task.definition.index]);
    }

    private getPatterns(folder: vscode.WorkspaceFolder): string[] {
        const value: unknown = vscode.workspace.getConfiguration('fast-tasks', folder.uri)
            .get('includeAdditionalTasksFiles', DEFAULT_PATTERNS);
        return Array.isArray(value)
            ? [...new Set(value.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0))]
            : [];
    }

    private watchFiles(): void {
        this.watchers.splice(0).forEach(disposable => disposable.dispose());
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            for (const pattern of this.getPatterns(folder)) {
                const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, pattern));
                this.watchers.push(watcher,
                    watcher.onDidCreate(this.onChange),
                    watcher.onDidChange(this.onChange),
                    watcher.onDidDelete(this.onChange));
            }
        }
    }

    async load(): Promise<vscode.Task[]> {
        const tasks: vscode.Task[] = [];
        const seen = new Set<string>();
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            for (const pattern of this.getPatterns(folder)) {
                const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern), null);
                for (const uri of uris.sort((left, right) => left.toString().localeCompare(right.toString()))) {
                    const owner = vscode.workspace.getWorkspaceFolder(uri);
                    if (owner?.uri.toString() !== folder.uri.toString() || seen.has(uri.toString())) {
                        continue;
                    }
                    seen.add(uri.toString());
                    if (uri.toString() === vscode.Uri.joinPath(folder.uri, '.vscode', 'tasks.json').toString() ||
                        uri.toString() === vscode.Uri.joinPath(folder.uri, 'tasks.json').toString()) {
                        continue;
                    }
                    tasks.push(...await this.loadFile(uri, folder));
                }
            }
        }
        return tasks;
    }

    private async loadFile(uri: vscode.Uri, folder: vscode.WorkspaceFolder): Promise<vscode.Task[]> {
        try {
            const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            const errors: JSONC.ParseError[] = [];
            const tree = JSONC.parseTree(content, errors, { allowTrailingComma: true });
            const tasksNode = tree && JSONC.findNodeAtLocation(tree, ['tasks']);
            if (!tree || errors.length || tasksNode?.type !== 'array') {
                console.warn(`Invalid additional tasks file: ${uri.toString()}`);
                return [];
            }
            const root = JSONC.getNodeValue(tree);
            return (tasksNode.children ?? []).flatMap((node, index) => {
                try {
                    const raw = JSONC.getNodeValue(node);
                    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return []; }
                    const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
                    const definition = {
                        ...root, ...root[platform], ...raw, ...raw[platform],
                        options: { ...root.options, ...root[platform]?.options, ...raw.options, ...raw[platform]?.options }
                    } as TaskDefinition;
                    definition.options = {
                        ...definition.options,
                        env: { ...root.options?.env, ...root[platform]?.options?.env, ...raw.options?.env, ...raw[platform]?.options?.env }
                    };
                    delete definition.tasks;
                    const name = definition.label ?? definition.taskName;
                    if (typeof name !== 'string' || !name) {
                        console.warn(`Unsupported additional task in ${uri.toString()}: ${name ?? index}`);
                        return [];
                    }
                    const execution = this.createExecution(definition, folder);
                    if (!execution && !definition.dependsOn && typeof definition.type !== 'string') { return []; }
                    const task = new vscode.Task(
                        execution || !definition.type
                            ? { type: 'fast-tasks', file: uri.toString(), index }
                            : { ...definition, type: definition.type },
                        folder, name, 'Workspace', execution, definition.problemMatcher ?? []
                    );
                    const group = typeof definition.group === 'string' ? definition.group : definition.group?.kind;
                    task.group = group === 'build' ? vscode.TaskGroup.Build : group === 'test' ? vscode.TaskGroup.Test : undefined;
                    task.isBackground = definition.isBackground === true;
                    const presentation = { ...definition.presentation };
                    presentation.reveal = this.enumValue(presentation.reveal, {
                        always: vscode.TaskRevealKind.Always, silent: vscode.TaskRevealKind.Silent, never: vscode.TaskRevealKind.Never
                    });
                    presentation.panel = this.enumValue(presentation.panel, {
                        shared: vscode.TaskPanelKind.Shared, dedicated: vscode.TaskPanelKind.Dedicated, new: vscode.TaskPanelKind.New
                    });
                    task.presentationOptions = presentation;
                    task.runOptions = definition.runOptions;
                    const labelNode = JSONC.findNodeAtLocation(node, ['label']) ?? JSONC.findNodeAtLocation(node, ['taskName']);
                    const info: AdditionalTaskInfo = {
                        uri,
                        line: content.slice(0, labelNode?.offset ?? node.offset).split(/\r?\n/).length - 1,
                        id: `${uri.toString()}#${index}:${name}`,
                        definition
                    };
                    this.taskInfo.set(task, info);
                    if (task.definition.type === 'fast-tasks') {
                        this.definitions.set(this.definitionKey(task), info);
                    }
                    return [task];
                } catch (error) {
                    console.error(`Failed to load additional task from ${uri.toString()}:`, error);
                    return [];
                }
            });
        } catch (error) {
            console.error(`Failed to read additional tasks file ${uri.toString()}:`, error);
            return [];
        }
    }

    private enumValue(value: unknown, values: Record<string, number>): number | undefined {
        return typeof value === 'string' ? values[value] : typeof value === 'number' ? value : undefined;
    }

    private createExecution(definition: TaskDefinition, folder: vscode.WorkspaceFolder): vscode.ShellExecution | vscode.ProcessExecution | undefined {
        if (typeof definition.command !== 'string' ||
            (definition.type && definition.type !== 'shell' && definition.type !== 'process')) { return undefined; }
        const options = { cwd: folder.uri.fsPath, ...definition.options };
        if (definition.type === 'process') {
            return new vscode.ProcessExecution(definition.command,
                (definition.args ?? []).map(arg => typeof arg === 'string' ? arg : arg.value), options);
        }
        if (definition.args) {
            return new vscode.ShellExecution(definition.command, definition.args, options);
        }
        return new vscode.ShellExecution(definition.command, options);
    }

    async run(task: vscode.Task, available: vscode.Task[], ancestors = new Set<vscode.Task>()): Promise<void> {
        const info = this.getInfo(task);
        if (!info) {
            await this.executeAndWait(task);
            return;
        }
        if (ancestors.has(task)) { throw new Error(`Circular task dependency: ${task.name}`); }
        const nextAncestors = new Set([...ancestors, task]);
        const names = info.definition.dependsOn;
        const dependencies = (Array.isArray(names) ? names : names ? [names] : []).map(name => {
            const candidates = available.filter(candidate => candidate.name === name &&
                (candidate.scope === task.scope ||
                    (typeof candidate.scope === 'object' && typeof task.scope === 'object' &&
                        candidate.scope.uri.toString() === task.scope.uri.toString())));
            const dependency = candidates.find(candidate => this.getInfo(candidate)?.uri.toString() === info.uri.toString()) ?? candidates[0];
            if (!dependency) { throw new Error(`Task dependency not found: ${name}`); }
            return dependency;
        });
        if (info.definition.dependsOrder === 'sequence') {
            for (const dependency of dependencies) { await this.run(dependency, available, nextAncestors); }
        } else {
            await Promise.all(dependencies.map(dependency => this.run(dependency, available, nextAncestors)));
        }
        if (task.execution || (info.definition.type && !info.definition.dependsOn)) {
            await this.executeAndWait(task);
        }
    }

    private async executeAndWait(task: vscode.Task): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            let execution: vscode.TaskExecution | undefined;
            const listener = vscode.tasks.onDidEndTaskProcess(event => {
                if (event.execution !== execution) { return; }
                listener.dispose();
                endListener.dispose();
                if (event.exitCode === 0) { resolve(); }
                else { reject(new Error(`Task failed: ${task.name} (${event.exitCode ?? 'unknown'})`)); }
            });
            const endListener = vscode.tasks.onDidEndTask(event => {
                if (event.execution !== execution) { return; }
                listener.dispose();
                endListener.dispose();
                reject(new Error(`Task ended without a successful process: ${task.name}`));
            });
            void vscode.tasks.executeTask(task).then(result => {
                execution = result;
                if (task.isBackground) {
                    listener.dispose();
                    endListener.dispose();
                    resolve();
                }
            }, error => {
                listener.dispose();
                endListener.dispose();
                reject(error);
            });
        });
    }
}
