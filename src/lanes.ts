export interface LaneItem {
  key: string
  startMin: number
  endMin: number
}

/**
 * Side-by-side lanes for anything that overlaps in time. Each cluster of overlapping items shares its
 * own lane count, so a clash narrows only the items involved and nothing sits on top of anything else.
 */
export function layoutLanes(items: LaneItem[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const out = new Map<string, { lane: number; lanes: number }>()
  let cluster: { key: string; lane: number }[] = []
  let laneEnds: number[] = []
  let clusterEnd = -1
  const flush = () => {
    for (const c of cluster) out.set(c.key, { lane: c.lane, lanes: laneEnds.length })
    cluster = []
    laneEnds = []
  }
  for (const item of sorted) {
    if (cluster.length && item.startMin >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= item.startMin)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = item.endMin
    cluster.push({ key: item.key, lane })
    clusterEnd = Math.max(clusterEnd, item.endMin)
  }
  flush()
  return out
}
