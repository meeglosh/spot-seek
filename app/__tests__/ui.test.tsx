import React from 'react';
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */
declare const __dirname: string;
import { Chip, HardShadow, SegmentedControl } from '../components/ui';
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

type Node = { type: string; props: Record<string, unknown>; children?: (Node | string)[] | null };

async function mount(el: React.ReactElement) {
  let root: { toJSON: () => Node } | undefined;
  await act(async () => { root = TestRenderer.create(el); });
  return root as { toJSON: () => Node };
}

function walk(n: Node | string | null | undefined, fn: (n: Node) => void) {
  if (!n || typeof n === 'string') return;
  fn(n);
  (n.children ?? []).forEach((c) => walk(c, fn));
}

function textNodes(root: Node, label: string): Node[] {
  const out: Node[] = [];
  walk(root, (n) => {
    if (n.type === 'Text' && (n.children ?? []).some((c) => c === label)) out.push(n);
  });
  return out;
}

describe('Chip', () => {
  it.each([
    ['selected, pressable', { active: true, onPress: () => {} }],
    ['selected, static', { active: true }],
    ['unselected', { active: false, onPress: () => {} }],
  ])('%s renders exactly one label Text node', async (_n, props) => {
    const root = (await mount(<Chip label="THIS WEEK" {...props} />)).toJSON();
    expect(textNodes(root, 'THIS WEEK')).toHaveLength(1);
  });

  it('selected pressable chip draws one shadow block', async () => {
    const root = (await mount(<Chip label="X" active onPress={() => {}} />)).toJSON();
    let blocks = 0;
    walk(root, (n) => { if (n.props.testID === 'hard-shadow-block') blocks += 1; });
    expect(blocks).toBe(1);
  });
});

describe('HardShadow', () => {
  it('renders the block BEHIND the content (earlier sibling, offset, shadow ink)', async () => {
    const root = (await mount(
      <HardShadow offset={3} contentStyle={{ backgroundColor: '#123456' }}>
        <React.Fragment />
      </HardShadow>,
    )).toJSON();
    const kids = (root.children ?? []) as Node[];
    expect(kids[0].props.testID).toBe('hard-shadow-block');
    expect(kids[1].props.testID).toBe('hard-shadow-content');
    const block = JSON.stringify(kids[0].props.style);
    expect(block).toContain('"position":"absolute"');
    expect(block).toContain('"left":3');
    expect(block).toContain('"top":3');
  });

  it('reserves the offset space and shifts only the content when pressed', async () => {
    const root = (await mount(<HardShadow offset={4} pressed><React.Fragment /></HardShadow>)).toJSON();
    expect(JSON.stringify(root.props.style)).toContain('"paddingRight":4');
    const [block, content] = root.children as Node[];
    expect(JSON.stringify(content.props.style)).toContain('"translateX":4');
    expect(JSON.stringify(block.props.style)).not.toContain('translate');
  });

  it('draws no block when inactive but keeps the reserved space', async () => {
    const root = (await mount(<HardShadow active={false}><React.Fragment /></HardShadow>)).toJSON();
    expect((root.children as Node[]).map((c) => c.props.testID)).toEqual(['hard-shadow-content']);
    expect(JSON.stringify(root.props.style)).toContain('paddingBottom');
  });
});

describe('SegmentedControl', () => {
  it('gives every segment a >=44pt face and exactly one shadow block', async () => {
    const root = (await mount(
      <SegmentedControl
        value="a"
        onChange={() => {}}
        options={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]}
      />,
    )).toJSON();
    let blocks = 0;
    const faces: Node[] = [];
    walk(root, (n) => {
      if (n.props.testID === 'hard-shadow-block') blocks += 1;
      if (n.props.testID === 'hard-shadow-content') faces.push(n);
    });
    expect(blocks).toBe(1);
    expect(faces).toHaveLength(2);
    for (const f of faces) expect(JSON.stringify(f.props.style)).toContain('"minHeight":44');
  });
});

describe('hard shadow implementation', () => {
  it('components/ui.tsx does not use platform shadow props or elevation', () => {
    const src = fs.readFileSync(path.join(__dirname, '../components/ui.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/shadowOpacity|shadowOffset|shadowRadius|shadowColor|elevation/);
  });

  it('no app source uses platform shadows or the removed helpers', () => {
    const roots = ['app', 'components', 'lib'].map((d) => path.join(__dirname, '..', d));
    const offenders: string[] = [];
    const visit = (p: string) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name);
        if (e.isDirectory()) visit(f);
        else if (/\.tsx?$/.test(e.name)
          && /shadowOpacity|elevation:|hardShadow\(|pressStyle\(/.test(fs.readFileSync(f, 'utf8'))) offenders.push(f);
      }
    };
    roots.forEach(visit);
    expect(offenders).toEqual([]);
  });
});
