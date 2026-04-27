import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGraphRenderPlan, normalizeSubjectGraphViewState } from './graph-view';
import type { KnowledgeNode } from './types';

function createNode(id: string, parentId: string | null, order: number, name = id): KnowledgeNode {
  return {
    id,
    subject: '数学',
    name,
    parentId,
    order,
  };
}

test('normalizeSubjectGraphViewState drops missing node references', () => {
  const nodes = [createNode('1', null, 1), createNode('1.1', '1', 1)];

  const normalized = normalizeSubjectGraphViewState(nodes, {
    focusNodeId: 'missing',
    collapsedNodeIds: ['1', 'missing'],
    includeDescendants: false,
    includeRelated: true,
    viewMode: 'outline',
  });

  assert.equal(normalized.focusNodeId, null);
  assert.deepEqual(normalized.collapsedNodeIds, ['1']);
  assert.equal(normalized.viewMode, 'outline');
  assert.equal(normalized.includeDescendants, false);
  assert.equal(normalized.includeRelated, true);
});

test('buildGraphRenderPlan keeps focus path visible even when ancestor is manually collapsed', () => {
  const nodes = [
    createNode('1', null, 1),
    createNode('1.1', '1', 1),
    createNode('1.1.1', '1.1', 1),
    createNode('1.1.1.1', '1.1.1', 1),
  ];

  const plan = buildGraphRenderPlan(nodes, {
    focusNodeId: '1.1.1.1',
    collapsedNodeIds: ['1.1'],
    maxVisibleNodes: 3,
  });

  assert.equal(plan.preferredFocusNodeId, '1.1.1.1');
  assert.equal(plan.visibleNodes.some((node) => node.id === '1.1.1.1'), true);
  assert.equal(plan.manualCollapsedIds.includes('1.1'), false);
});

test('buildGraphRenderPlan never renders more than 100 nodes and reports auto collapsed summaries', () => {
  const nodes: KnowledgeNode[] = [createNode('root', null, 1)];
  for (let i = 1; i <= 140; i += 1) {
    nodes.push(createNode(`c${i}`, 'root', i));
  }

  const plan = buildGraphRenderPlan(nodes, {
    maxVisibleNodes: 100,
  });

  assert.equal(plan.visibleNodeCount <= 100, true);
  assert.equal(plan.hiddenNodeCount > 0, true);
  assert.equal(plan.autoCollapsedIds.includes('root'), true);
  assert.equal(plan.anchorNodeId, 'root');
  assert.equal(plan.collapsedSummaryByNodeId.root.hiddenDescendantCount, 41);
});

test('buildGraphRenderPlan prioritizes nodes closest to the focused node by tree distance', () => {
  const nodes: KnowledgeNode[] = [
    createNode('root', null, 1),
    createNode('a', 'root', 1),
    createNode('a.1', 'a', 1),
    createNode('a.1.1', 'a.1', 1),
    createNode('a.1.2', 'a.1', 2),
    createNode('a.2', 'a', 2),
    createNode('a.2.1', 'a.2', 1),
    createNode('b', 'root', 2),
    createNode('b.1', 'b', 1),
    createNode('b.1.1', 'b.1', 1),
    createNode('b.2', 'b', 2),
  ];

  const plan = buildGraphRenderPlan(nodes, {
    focusNodeId: 'a.1.1',
    maxVisibleNodes: 7,
  });

  const visibleNodeIds = new Set(plan.visibleNodes.map((node) => node.id));
  assert.equal(visibleNodeIds.has('a.1.2'), true);
  assert.equal(visibleNodeIds.has('a.2'), true);
  assert.equal(visibleNodeIds.has('b.1.1'), false);
  assert.equal(plan.visibleNodeIdsInPriorityOrder[0], 'root');
  assert.equal(plan.visibleNodeIdsInPriorityOrder.includes('a.1.1'), true);
});

test('buildGraphRenderPlan remains stable across recalculation and does not persist auto collapsed ids', () => {
  const nodes: KnowledgeNode[] = [createNode('root', null, 1), createNode('branch', 'root', 1)];
  for (let i = 1; i <= 110; i += 1) {
    nodes.push(createNode(`c${i}`, 'branch', i));
  }

  const first = buildGraphRenderPlan(nodes, {
    collapsedNodeIds: ['branch'],
    maxVisibleNodes: 100,
  });
  const second = buildGraphRenderPlan(nodes, {
    collapsedNodeIds: ['branch'],
    maxVisibleNodes: 100,
  });

  assert.deepEqual(first.autoCollapsedIds, second.autoCollapsedIds);
  assert.deepEqual(first.visibleNodeIdsInPriorityOrder, second.visibleNodeIdsInPriorityOrder);
  assert.deepEqual(first.manualCollapsedIds, ['branch']);
});

test('buildGraphRenderPlan falls back to the first root when focused node is missing across multiple roots', () => {
  const nodes = [
    createNode('r1', null, 1),
    createNode('r1.1', 'r1', 1),
    createNode('r2', null, 2),
    createNode('r2.1', 'r2', 1),
  ];

  const plan = buildGraphRenderPlan(nodes, {
    focusNodeId: 'missing',
    maxVisibleNodes: 3,
  });

  assert.equal(plan.anchorNodeId, 'r1');
  assert.equal(plan.preferredFocusNodeId, 'r1');
  assert.equal(plan.visibleNodes.some((node) => node.id === 'r1.1'), true);
});
