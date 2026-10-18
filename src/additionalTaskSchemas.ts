import * as vscode from 'vscode';

const SCHEMA_URL = 'fast-tasks://schemas/tasks';

interface SchemaAssociation {
    url?: string;
    fileMatch?: string[];
    schema?: Record<string, unknown>;
}

export class AdditionalTaskSchemas implements vscode.Disposable {
    private readonly subscriptions: vscode.Disposable[];
    private pending: Promise<void> = Promise.resolve();
    private disposed = false;

    constructor(private readonly getPatterns: (folder: vscode.WorkspaceFolder) => string[]) {
        this.subscriptions = [
            vscode.workspace.onDidChangeWorkspaceFolders(() => { void this.sync(); }),
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('fast-tasks.includeAdditionalTasksFiles') ||
                    event.affectsConfiguration('json.schemas')) {
                    void this.sync();
                }
            })
        ];
        void this.sync();
    }

    sync(): Promise<void> {
        this.pending = this.pending.then(async () => {
            if (this.disposed) { return; }
            for (const folder of vscode.workspace.workspaceFolders ?? []) {
                const config = vscode.workspace.getConfiguration('json', folder.uri);
                const inspection = config.inspect<SchemaAssociation[]>('schemas');
                const current = vscode.workspace.workspaceFile
                    ? inspection?.workspaceFolderValue : inspection?.workspaceValue;
                const associations = (current ?? []).filter(entry => entry.url !== SCHEMA_URL);
                const patterns = this.getPatterns(folder);
                if (patterns.length) {
                    associations.push({
                        url: SCHEMA_URL,
                        fileMatch: patterns.map(pattern =>
                            `${folder.uri.toString().replace(/\/$/, '')}/${pattern.replace(/^\.\//, '')}`),
                        schema: {
                            $ref: 'vscode://schemas/tasks',
                            allowComments: true,
                            allowTrailingCommas: true
                        }
                    });
                }
                if (JSON.stringify(current ?? []) !== JSON.stringify(associations)) {
                    await config.update('schemas', associations.length ? associations : undefined,
                        vscode.workspace.workspaceFile
                            ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Workspace);
                }
            }
        }).catch(error => {
            console.error('Failed to configure additional task schemas:', error);
        });
        return this.pending;
    }

    dispose(): void {
        this.disposed = true;
        this.subscriptions.forEach(subscription => subscription.dispose());
    }
}
