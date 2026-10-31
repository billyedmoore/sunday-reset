import { describe, expect, it } from 'vitest'
import { layoutLanes } from './lanes'

const item = (key: string, startMin: number, endMin: number) => ({ key, startMin, endMin })

describe('layoutLanes', () => {
  it('gives items that do not overlap a full-width lane each', () => {
    const out = layoutLanes([item('a', 540, 600), item('b', 600, 660), item('c', 700, 760)])
    for (const k of ['a', 'b', 'c']) expect(out.get(k)).toEqual({ lane: 0, lanes: 1 })
  })

  it('puts overlapping items side by side', () => {
    const out = layoutLanes([item('event', 600, 720), item('task', 660, 780)])
    expect(out.get('event')).toEqual({ lane: 0, lanes: 2 })
    expect(out.get('task')).toEqual({ lane: 1, lanes: 2 })
  })

  it('narrows only the cluster that clashes, not the whole day', () => {
    const out = layoutLanes([item('a', 540, 600), item('b', 570, 630), item('later', 900, 960)])
    expect(out.get('a')?.lanes).toBe(2)
    expect(out.get('b')?.lanes).toBe(2)
    expect(out.get('later')).toEqual({ lane: 0, lanes: 1 })
  })

  it('reuses a free lane inside a cluster', () => {
    // a and b overlap; c starts after a ends, so it takes a's lane and the cluster stays two wide.
    const out = layoutLanes([item('a', 540, 600), item('b', 570, 720), item('c', 610, 700)])
    expect(out.get('c')).toEqual({ lane: 0, lanes: 2 })
  })

  it('handles an empty list', () => {
    expect(layoutLanes([]).size).toBe(0)
  })
})
