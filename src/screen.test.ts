import { describe, expect, it } from 'vitest'
import { screenProblem } from './screen'

describe('screenProblem', () => {
  it('finds phones by their short side, upright or sideways', () => {
    expect(screenProblem({ width: 390, shortSide: 390 })).toBe('phone')
    expect(screenProblem({ width: 844, shortSide: 390 })).toBe('phone')
    // A large phone on its side is wider than a small tablet, but is still a phone.
    expect(screenProblem({ width: 956, shortSide: 440 })).toBe('phone')
  })

  it('allows iPads both ways up', () => {
    expect(screenProblem({ width: 744, shortSide: 744 })).toBe(null) // iPad mini, upright
    expect(screenProblem({ width: 820, shortSide: 820 })).toBe(null)
    expect(screenProblem({ width: 1180, shortSide: 820 })).toBe(null)
    expect(screenProblem({ width: 1366, shortSide: 1024 })).toBe(null)
  })

  it('allows laptops and desktops', () => {
    expect(screenProblem({ width: 1280, shortSide: 800 })).toBe(null)
    expect(screenProblem({ width: 1920, shortSide: 1080 })).toBe(null)
  })

  it('asks for a wider window on a big screen', () => {
    expect(screenProblem({ width: 500, shortSide: 1080 })).toBe('narrow') // small desktop window
    expect(screenProblem({ width: 590, shortSide: 820 })).toBe('narrow') // iPad sharing the screen half and half
  })

  it('draws the line at 700px wide', () => {
    expect(screenProblem({ width: 699, shortSide: 900 })).toBe('narrow')
    expect(screenProblem({ width: 700, shortSide: 900 })).toBe(null)
  })
})
