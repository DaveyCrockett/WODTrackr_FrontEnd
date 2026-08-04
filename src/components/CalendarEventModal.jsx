import "../CSS/calendarEventModal.css"

function CalendarEventModal({ entry, dateLabel, onClose }) {
  if (!entry) {
    return null
  }

  return (
    <div className="calendar-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="calendar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="calendar-modal-header">
          <div>
            <p className="calendar-modal-eyebrow">Workout details</p>
            <h2 id="calendar-event-modal-title">{entry.title}</h2>
          </div>
          <button type="button" className="calendar-modal-close" onClick={onClose} aria-label="Close workout details">
            Close
          </button>
        </header>
        <div className="calendar-modal-body">
          <p className="calendar-modal-date">{dateLabel}</p>
          <p className="calendar-entry-meta">{entry.time || "No time set"}</p>
          <p className="calendar-entry-notes">{entry.notes || "No notes for this event."}</p>
        </div>
      </div>
    </div>
  )
}

export default CalendarEventModal
