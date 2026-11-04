import * as assert from 'assert';
import { extractViewConfig, buildViewHierarchy } from '../taskView';

suite('extractViewConfig', () => {
    test('Accepts a valid parentLabel', () => {
        const view = extractViewConfig({ parentLabel: 'Build Group' });
        assert.deepStrictEqual(view, { parentLabel: 'Build Group' });
    });

    test('Accepts a valid parentId', () => {
        const view = extractViewConfig({ parentId: 'Build' });
        assert.deepStrictEqual(view, { parentId: 'Build' });
    });

    test('Rejects both parentLabel and parentId set together', () => {
        assert.strictEqual(extractViewConfig({ parentLabel: 'Group', parentId: 'Build' }), undefined);
    });

    test('Ignores empty or malformed values', () => {
        assert.strictEqual(extractViewConfig(undefined), undefined);
        assert.strictEqual(extractViewConfig(null), undefined);
        assert.strictEqual(extractViewConfig('Group'), undefined);
        assert.strictEqual(extractViewConfig({}), undefined);
        assert.strictEqual(extractViewConfig({ parentLabel: '' }), undefined);
        assert.strictEqual(extractViewConfig({ parentLabel: 42 }), undefined);
    });

    test('Accepts a standalone identifier (no-op parent declaring only its own name)', () => {
        const view = extractViewConfig({ identifier: 'demo-parent' });
        assert.deepStrictEqual(view, { identifier: 'demo-parent' });
    });

    test('Accepts identifier combined with parentLabel', () => {
        const view = extractViewConfig({ identifier: 'demo-parent', parentLabel: 'Group' });
        assert.deepStrictEqual(view, { identifier: 'demo-parent', parentLabel: 'Group' });
    });

    test('Keeps a valid identifier even when parentLabel/parentId conflict with each other', () => {
        const view = extractViewConfig({ identifier: 'demo-parent', parentLabel: 'Group', parentId: 'Build' });
        assert.deepStrictEqual(view, { identifier: 'demo-parent' });
    });
});

suite('buildViewHierarchy', () => {
    test('Groups tasks sharing the same parentLabel under one node', () => {
        const result = buildViewHierarchy([
            { key: 'A', view: { parentLabel: 'Group 1' } },
            { key: 'B', view: { parentLabel: 'Group 1' } },
            { key: 'C' }
        ]);

        assert.deepStrictEqual(result.groupLabels, ['Group 1']);
        assert.deepStrictEqual(result.childrenOfGroup.get('Group 1'), ['A', 'B']);
        assert.ok(result.consumedKeys.has('A'));
        assert.ok(result.consumedKeys.has('B'));
        assert.ok(!result.consumedKeys.has('C'));
    });

    test('Nests a task under another task via parentId', () => {
        const result = buildViewHierarchy([
            { key: 'Parent' },
            { key: 'Child', view: { parentId: 'Parent' } }
        ]);

        assert.deepStrictEqual(result.childrenOfTask.get('Parent'), ['Child']);
        assert.ok(result.consumedKeys.has('Child'));
        assert.ok(result.parentKeysWithChildren.has('Parent'));
        assert.ok(!result.consumedKeys.has('Parent'));
    });

    test('Ignores parentId that does not match any task identifier', () => {
        const result = buildViewHierarchy([
            { key: 'Child', view: { parentId: 'Ghost' } }
        ]);

        assert.strictEqual(result.consumedKeys.size, 0);
        assert.strictEqual(result.childrenOfTask.size, 0);
    });

    test('Ignores a parentId that would create a cycle', () => {
        const result = buildViewHierarchy([
            { key: 'A', view: { parentId: 'B' } },
            { key: 'B', view: { parentId: 'A' } }
        ]);

        assert.strictEqual(result.consumedKeys.size, 0);
    });

    test('Ignores direct self-reference', () => {
        const result = buildViewHierarchy([
            { key: 'A', view: { parentId: 'A' } }
        ]);

        assert.strictEqual(result.consumedKeys.size, 0);
    });

    test('A task can both have a parent and have children of its own', () => {
        const result = buildViewHierarchy([
            { key: 'Grandparent' },
            { key: 'Parent', view: { parentId: 'Grandparent' } },
            { key: 'Child', view: { parentId: 'Parent' } }
        ]);

        assert.ok(result.consumedKeys.has('Parent'));
        assert.ok(result.consumedKeys.has('Child'));
        assert.ok(result.parentKeysWithChildren.has('Grandparent'));
        assert.ok(result.parentKeysWithChildren.has('Parent'));
        assert.deepStrictEqual(result.childrenOfTask.get('Grandparent'), ['Parent']);
        assert.deepStrictEqual(result.childrenOfTask.get('Parent'), ['Child']);
    });

    test('A no-op parent task is targeted by its declared identifier, not its label', () => {
        const result = buildViewHierarchy([
            { key: 'Demo: view parent (no-op)', view: { identifier: 'demo-parent' } },
            { key: 'Demo: view child via identifier', view: { parentId: 'demo-parent' } }
        ]);

        assert.deepStrictEqual(result.childrenOfTask.get('Demo: view parent (no-op)'), ['Demo: view child via identifier']);
        assert.ok(result.parentKeysWithChildren.has('Demo: view parent (no-op)'));
        assert.ok(result.consumedKeys.has('Demo: view child via identifier'));
        assert.ok(!result.consumedKeys.has('Demo: view parent (no-op)'));
    });

    test('A duplicate identifier is ignored (first registrant wins) rather than silently reassigning children', () => {
        const result = buildViewHierarchy([
            { key: 'A', view: { identifier: 'dup' } },
            { key: 'B', view: { identifier: 'dup' } },
            { key: 'C', view: { parentId: 'dup' } }
        ]);

        assert.deepStrictEqual(result.childrenOfTask.get('A'), ['C']);
        assert.ok(!result.childrenOfTask.has('B'));
    });

    test('A task\'s own key still works as a parentId target even when it also declares an identifier', () => {
        const result = buildViewHierarchy([
            { key: 'Parent', view: { identifier: 'alias-for-parent' } },
            { key: 'Child', view: { parentId: 'Parent' } }
        ]);

        assert.deepStrictEqual(result.childrenOfTask.get('Parent'), ['Child']);
    });
});
