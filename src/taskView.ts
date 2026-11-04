import * as vscode from 'vscode';

/**
 * Parsed `view` property of a task definition in tasks.json.
 * `identifier` may be combined with either parentLabel or parentId (or neither);
 * parentLabel/parentId are themselves mutually exclusive (enforced by extractViewConfig).
 */
export interface TaskViewConfig {
    /** A stable name other tasks can target via `parentId`, instead of this task's own label. */
    identifier?: string;
    parentLabel?: string;
    parentId?: string;
}

/** An entry fed into buildViewHierarchy: a task's identifier plus its optional view config. */
export interface ViewHierarchyEntry {
    key: string;
    view?: TaskViewConfig;
}

export interface ViewHierarchyResult {
    /** Task keys that are nested under a group or another task; excluded from the root/folder listing. */
    consumedKeys: Set<string>;
    /** Task keys that act as a parent for at least one other task (render as collapsible). */
    parentKeysWithChildren: Set<string>;
    /** Distinct parentLabel values, in first-seen order; one virtual GroupItem per label. */
    groupLabels: string[];
    /** Group label -> ordered child task keys. */
    childrenOfGroup: Map<string, string[]>;
    /** Task key -> ordered child task keys. */
    childrenOfTask: Map<string, string[]>;
}

/**
 * Validates a raw `view` value from tasks.json. parentLabel and parentId are
 * mutually exclusive; invalid or empty shapes are ignored (logged, not thrown),
 * since a malformed task definition should never break the whole tree.
 */
export function extractViewConfig(raw: unknown): TaskViewConfig | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }

    const { identifier, parentLabel, parentId } = raw as { identifier?: unknown; parentLabel?: unknown; parentId?: unknown };
    const hasIdentifier = typeof identifier === 'string' && identifier.length > 0;
    const hasLabel = typeof parentLabel === 'string' && parentLabel.length > 0;
    const hasId = typeof parentId === 'string' && parentId.length > 0;

    const config: TaskViewConfig = {};
    if (hasIdentifier) {
        config.identifier = identifier as string;
    }

    if (hasLabel && hasId) {
        console.warn('Fast Tasks: "view" cannot set both parentLabel and parentId on the same task; ignoring both.');
    } else if (hasLabel) {
        config.parentLabel = parentLabel as string;
    } else if (hasId) {
        config.parentId = parentId as string;
    }

    return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * Builds the parent/child relationships declared via `view.parentLabel` and
 * `view.parentId`. Pure function: the caller owns turning keys back into
 * TreeItems. Groups (parentLabel) are always top-level and never nest under
 * one another or under a task; only tasks (parentId) can have task parents.
 */
export function buildViewHierarchy(entries: ViewHierarchyEntry[]): ViewHierarchyResult {
    // Every task is reachable by its own key by default; an explicit view.identifier
    // adds an alias so parentId can target a stable name instead of the display label.
    const identifierToKey = new Map<string, string>();
    for (const { key } of entries) {
        identifierToKey.set(key, key);
    }
    for (const { key, view } of entries) {
        if (!view?.identifier) {
            continue;
        }
        const existingOwner = identifierToKey.get(view.identifier);
        if (existingOwner && existingOwner !== key) {
            console.warn(`Fast Tasks: view.identifier "${view.identifier}" is already used by "${existingOwner}"; ignoring the duplicate on "${key}".`);
            continue;
        }
        identifierToKey.set(view.identifier, key);
    }

    // Resolve every declared parentId to a canonical task key up front, so cycle
    // detection and child-list building both walk real keys, not raw aliases.
    const resolvedParentOf = new Map<string, string>();
    for (const { key, view } of entries) {
        if (!view?.parentId) {
            continue;
        }
        const targetKey = identifierToKey.get(view.parentId);
        if (!targetKey) {
            console.warn(`Fast Tasks: view.parentId "${view.parentId}" does not match any task identifier; ignoring.`);
            continue;
        }
        resolvedParentOf.set(key, targetKey);
    }

    const consumedKeys = new Set<string>();
    const parentKeysWithChildren = new Set<string>();
    const groupLabels: string[] = [];
    const childrenOfGroup = new Map<string, string[]>();
    const childrenOfTask = new Map<string, string[]>();

    // Best-effort guard: does walking resolved parent links up from targetKey ever reach startKey?
    // Used to reject a link that would otherwise close a cycle.
    const createsCycle = (startKey: string, targetKey: string): boolean => {
        const visited = new Set<string>();
        let current = targetKey;
        while (true) {
            if (current === startKey) {
                return true;
            }
            if (visited.has(current)) {
                return false;
            }
            visited.add(current);
            const next = resolvedParentOf.get(current);
            if (!next) {
                return false;
            }
            current = next;
        }
    };

    for (const { key, view } of entries) {
        if (!view) {
            continue;
        }

        if (view.parentLabel) {
            const list = childrenOfGroup.get(view.parentLabel);
            if (list) {
                list.push(key);
            } else {
                groupLabels.push(view.parentLabel);
                childrenOfGroup.set(view.parentLabel, [key]);
            }
            consumedKeys.add(key);
            continue;
        }

        const parentKey = resolvedParentOf.get(key);
        if (!parentKey) {
            continue;
        }
        if (createsCycle(key, parentKey)) {
            console.warn(`Fast Tasks: view.parentId "${view.parentId}" would create a cycle; ignoring.`);
            continue;
        }
        const list = childrenOfTask.get(parentKey);
        if (list) {
            list.push(key);
        } else {
            childrenOfTask.set(parentKey, [key]);
        }
        consumedKeys.add(key);
        parentKeysWithChildren.add(parentKey);
    }

    return { consumedKeys, parentKeysWithChildren, groupLabels, childrenOfGroup, childrenOfTask };
}

/** Virtual tree node created for a `view.parentLabel`. Not a real task; cannot be run or edited. */
export class GroupItem extends vscode.TreeItem {
    constructor(public readonly identifier: string) {
        super(identifier, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'taskViewGroup';
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}
