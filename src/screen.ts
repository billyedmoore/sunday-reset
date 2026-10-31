/** Below this width the layout can't hold the task list beside a week of events. */
export const MIN_WIDTH = 760
/** A touch screen narrower than this is treated as a phone or small tablet, whatever its pixel width says. */
export const MIN_TOUCH_WIDTH = 900

/**
 * Sunday Reset is built for a laptop or desktop screen. This decides when to show a short explanation
 * instead of a layout that can't work: a narrow window, or a small touch screen.
 */
export function isUnsupportedScreen(width: number, coarsePointer: boolean): boolean {
  return width < MIN_WIDTH || (coarsePointer && width < MIN_TOUCH_WIDTH)
}
