// Placeholder boxes for the week's to-dos; entry and drag-to-calendar come in a later step.
export default function TaskList() {
  return (
    <div className="tasks" aria-label="Things to do this week">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="task-box" />
      ))}
    </div>
  )
}
