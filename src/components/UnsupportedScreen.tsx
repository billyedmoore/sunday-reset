/** Shown instead of the app on a phone or other screen that's too small for the planner. */
export default function UnsupportedScreen() {
  return (
    <main className="unsupported" role="alert">
      <h1>Sunday Reset</h1>
      <p>Sunday Reset needs a laptop or desktop screen.</p>
      <p className="hint">Open it there to plan your week. Your data stays in that browser.</p>
    </main>
  )
}
