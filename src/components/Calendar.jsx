import { useMemo, useState } from "react"
import CalendarEventModal from "./CalendarEventModal"
import useCalendarEntries from "../hooks/useCalendarEntries"
import { dayLabels, fromDateKey, isDateInSameWeek, toDateKey } from "../utils/calendarUtils"
import "../CSS/calendar.css"

function Calendar() {
  const today = useMemo(() => new Date(), [])
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDateKey, setSelectedDateKey] = useState(toDateKey(today))
  const [entriesByDate] = useCalendarEntries()
  const [selectedEntryId, setSelectedEntryId] = useState(null)
  const [modalEntryId, setModalEntryId] = useState(null)

  const selectedEntries = entriesByDate[selectedDateKey] || []
  const activeSelectedEntryId = selectedEntries.some((entry) => entry.id === selectedEntryId) ? selectedEntryId : null
  const activeModalEntryId = selectedEntries.some((entry) => entry.id === modalEntryId) ? modalEntryId : null
  const selectedEntry = selectedEntries.find((entry) => entry.id === activeSelectedEntryId) || null
  const modalEntry = selectedEntries.find((entry) => entry.id === activeModalEntryId) || null

  const monthLabel = currentMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })

  const selectedDateLabel = fromDateKey(selectedDateKey).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const calendarCells = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDayOfMonth = new Date(year, month, 1).getDay()
    const numberOfDays = new Date(year, month + 1, 0).getDate()

    const leadingBlanks = Array.from({ length: firstDayOfMonth }, () => null)
    const monthDays = Array.from({ length: numberOfDays }, (_, index) => {
      const dateValue = new Date(year, month, index + 1)
      return {
        dateValue,
        dateKey: toDateKey(dateValue),
      }
    })

    const cells = [...leadingBlanks, ...monthDays]
    while (cells.length % 7 !== 0) {
      cells.push(null)
    }
    return cells
  }, [currentMonth])

  const goToPreviousMonth = () => {
    setCurrentMonth((prevMonth) => new Date(prevMonth.getFullYear(), prevMonth.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth((prevMonth) => new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 1))
  }

  return (
    <section className="page calendar-page">
      <header className="calendar-header">
        <div>
          <h1>Training Calendar</h1>
          <p>View your scheduled events by selecting a date.</p>
        </div>
        <div className="calendar-nav-controls" aria-label="Change month">
          <button type="button" onClick={goToPreviousMonth}>
            Prev
          </button>
          <p>{monthLabel}</p>
          <button type="button" onClick={goToNextMonth}>
            Next
          </button>
        </div>
      </header>

      <div className="calendar-layout">
        <section className="calendar-board" aria-label="Monthly calendar">
          <div className="calendar-weekdays">
            {dayLabels.map((dayLabel) => (
              <p key={dayLabel}>{dayLabel}</p>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarCells.map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} className="calendar-cell calendar-cell-empty" aria-hidden="true" />
              }

              const entryCount = (entriesByDate[cell.dateKey] || []).length
              const isSelected = selectedDateKey === cell.dateKey
              const isToday = toDateKey(today) === cell.dateKey
              const isCurrentWeek = isDateInSameWeek(cell.dateValue, today)

              return (
                <button
                  type="button"
                  key={cell.dateKey}
                  className={`calendar-cell${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}${isCurrentWeek ? " is-current-week" : ""}`}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => {
                    setSelectedDateKey(cell.dateKey)
                    setSelectedEntryId(null)
                    setModalEntryId(null)
                  }}
                >
                  <span className="calendar-day-number">{cell.dateValue.getDate()}</span>
                  {entryCount > 0 ? <span className="calendar-entry-count">{entryCount} item(s)</span> : null}
                </button>
              )
            })}
          </div>
        </section>

        <aside className="calendar-editor" aria-label="Selected date details">
          <h2>{selectedDateLabel}</h2>

          <section className="calendar-selected-details" aria-label="Selected event details">
            <h3>Event Details</h3>
            {!selectedEntry ? (
              <p>Select an event below to view details.</p>
            ) : (
              <div>
                <p className="calendar-entry-title">{selectedEntry.title}</p>
                <p className="calendar-entry-meta">{selectedEntry.time || "No time set"}</p>
                <p className="calendar-entry-notes">{selectedEntry.notes || "No notes for this event."}</p>
                <button type="button" className="calendar-detail-modal-btn" onClick={() => setModalEntryId(selectedEntry.id)}>
                  Open workout details
                </button>
              </div>
            )}
          </section>

          <div className="calendar-entry-list">
            <h3>Scheduled Items</h3>
            {selectedEntries.length === 0 ? (
              <p>No events for this day yet.</p>
            ) : (
              <ul>
                {selectedEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={`calendar-entry-item${selectedEntryId === entry.id ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedEntryId(entry.id)
                        setModalEntryId(entry.id)
                      }}
                    >
                      <p className="calendar-entry-title">{entry.title}</p>
                      <p className="calendar-entry-meta">{entry.time || "No time set"}</p>
                      {entry.notes ? <p className="calendar-entry-notes">{entry.notes}</p> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <CalendarEventModal entry={modalEntry} dateLabel={selectedDateLabel} onClose={() => setModalEntryId(null)} />
    </section>
  )
}

export default Calendar
