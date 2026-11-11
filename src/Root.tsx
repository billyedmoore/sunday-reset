import { useEffect, useState } from 'react'
import App from './App'
import UnsupportedScreen from './components/UnsupportedScreen'
import { screenProblem } from './screen'

/** The window's width and the device screen's short side. Neither changes when a keyboard slides up. */
const measure = () => screenProblem({ width: window.innerWidth, shortSide: Math.min(window.screen.width, window.screen.height) })

/** Shows the app, or an explanation where it can't fit; follows window resizes and rotation. */
export default function Root() {
  const [problem, setProblem] = useState(measure)
  useEffect(() => {
    const update = () => setProblem(measure())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return problem ? <UnsupportedScreen problem={problem} /> : <App />
}
