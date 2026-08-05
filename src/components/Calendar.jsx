import { useEffect, useMemo, useRef, useState } from "react"
import "../CSS/calendar.css"

const STORAGE_KEY = "wodtrackrCalendarEntries"
const SCHEDULED_PROGRAMS_KEY = "wodtrackrScheduledPrograms"

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const toDateKey = (dateValue) => {
  const year = dateValue.getFullYear()
  const month = String(dateValue.getMonth() + 1).padStart(2, "0")
  const day = String(dateValue.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const fromDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const EMPTY_ENTRY_FORM = { title: "", time: "", notes: "" }

const normalizeEntriesByDate = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return Object.entries(value).reduce((accumulator, [dateKey, entries]) => {
    if (!Array.isArray(entries)) return accumulator
    accumulator[dateKey] = entries.filter((entry) => entry && typeof entry === "object")
    return accumulator
  }, {})
}

const mergeEntriesByDate = (baseEntries, incomingEntries) => {
  const merged = { ...baseEntries }

  for (const [dateKey, entries] of Object.entries(incomingEntries)) {
    if (!Array.isArray(entries) || entries.length === 0) continue

    const existingEntries = Array.isArray(merged[dateKey]) ? merged[dateKey] : []
    const dedupeKeys = new Set(
      existingEntries.map((entry) =>
        `${entry?.id ?? ""}|${entry?.title ?? ""}|${entry?.time ?? ""}|${entry?.programId ?? ""}|${entry?.weekNumber ?? ""}`,
      ),
    )

    const nextEntries = [...existingEntries]
    for (const entry of entries) {
      const dedupeKey = `${entry?.id ?? ""}|${entry?.title ?? ""}|${entry?.time ?? ""}|${entry?.programId ?? ""}|${entry?.weekNumber ?? ""}`
      if (dedupeKeys.has(dedupeKey)) continue
      dedupeKeys.add(dedupeKey)
      nextEntries.push(entry)
    }

    merged[dateKey] = nextEntries
  }

  return merged
}

const parseStoredEntries = (storageValue) => {
  if (!storageValue) return {}
  try {
    return normalizeEntriesByDate(JSON.parse(storageValue))
  } catch {
    return {}
  }
}

const loadEntriesFromStorage = () => {
  const calendarEntries = parseStoredEntries(localStorage.getItem(STORAGE_KEY))
  const legacyScheduledPrograms = parseStoredEntries(localStorage.getItem(SCHEDULED_PROGRAMS_KEY))
  return mergeEntriesByDate(calendarEntries, legacyScheduledPrograms)
}

const countProgramEntries = (entriesByDate) =>
  Object.values(entriesByDate).reduce((count, entries) => {
    if (!Array.isArray(entries)) return count
    return count + entries.filter((entry) => Boolean(entry?.programId)).length
  }, 0)

function Calendar() {
  const today = new Date()
  const todayKey = toDateKey(today)

  const [viewMode, setViewMode] = useState("month")
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - d.getDay())
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  })
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
  const [entriesByDate, setEntriesByDate] = useState({})
  const [selectedEntryId, setSelectedEntryId] = useState(null)

  // Add / Edit form state
  const [panelMode, setPanelMode] = useState("detail") // "detail" | "add" | "edit"
  const [addFormValues, setAddFormValues] = useState(EMPTY_ENTRY_FORM)
  const [editFormValues, setEditFormValues] = useState(EMPTY_ENTRY_FORM)
  const [formError, setFormError] = useState("")

  // Program event detail modal
  const [programModalEntry, setProgramModalEntry] = useState(null)
  const [syncNotice, setSyncNotice] = useState("")
  const syncNoticeTimerRef = useRef(null)
  const programEntryCountRef = useRef(0)

  const showSyncNotice = (message) => {
    setSyncNotice(message)
    if (syncNoticeTimerRef.current) {
      window.clearTimeout(syncNoticeTimerRef.current)
    }
    syncNoticeTimerRef.current = window.setTimeout(() => {
      setSyncNotice("")
      syncNoticeTimerRef.current = null
    }, 4000)
  }

  // Load from localStorage on mount
  useEffect(() => {
    const initialEntries = loadEntriesFromStorage()
    setEntriesByDate(initialEntries)
    programEntryCountRef.current = countProgramEntries(initialEntries)
    if (programEntryCountRef.current > 0) {
      showSyncNotice("Program schedule synced to Calendar.")
    }
  }, [])

  useEffect(() => {
    const syncEntriesFromStorage = () => {
      const nextEntries = loadEntriesFromStorage()
      const nextProgramEntryCount = countProgramEntries(nextEntries)
      const hadProgramEntries = programEntryCountRef.current > 0
      const hasMoreProgramEntries = nextProgramEntryCount > programEntryCountRef.current

      setEntriesByDate(nextEntries)
      programEntryCountRef.current = nextProgramEntryCount

      if ((!hadProgramEntries && nextProgramEntryCount > 0) || hasMoreProgramEntries) {
        showSyncNotice("Program schedule synced to Calendar.")
      }
    }

    const handleStorage = (event) => {
      if (!event?.key || event.key === STORAGE_KEY || event.key === SCHEDULED_PROGRAMS_KEY) {
        syncEntriesFromStorage()
      }
    }

    window.addEventListener("storage", handleStorage)
    document.addEventListener("visibilitychange", syncEntriesFromStorage)

    return () => {
      window.removeEventListener("storage", handleStorage)
      document.removeEventListener("visibilitychange", syncEntriesFromStorage)
      if (syncNoticeTimerRef.current) {
        window.clearTimeout(syncNoticeTimerRef.current)
      }
    }
  }, [])

  const persistEntries = (nextEntries) => {
    setEntriesByDate(nextEntries)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries))
    } catch {
      // Storage write failure is non-critical.
    }
  }

  const selectedEntries = entriesByDate[selectedDateKey] || []
  const selectedEntry = selectedEntries.find((entry) => entry.id === selectedEntryId) || null

  useEffect(() => {
    if (selectedEntries.length === 0) {
      setSelectedEntryId(null)
      return
    }
    const hasSelectedEntry = selectedEntries.some((entry) => entry.id === selectedEntryId)
    if (!hasSelectedEntry) {
      setSelectedEntryId(null)
    }
  }, [selectedDateKey, selectedEntries, selectedEntryId])

  // Reset panel to detail when date changes
  useEffect(() => {
    setPanelMode("detail")
    setFormError("")
  }, [selectedDateKey])

  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    return `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
  }, [weekStart])

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
      return { dateValue, dateKey: toDateKey(dateValue) }
    })

    const cells = [...leadingBlanks, ...monthDays]
    while (cells.length % 7 !== 0) {
      cells.push(null)
    }
    return cells
  }, [currentMonth])

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return { dateValue: d, dateKey: toDateKey(d) }
    })
  }, [weekStart])

  const goToPreviousMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }
  const goToNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }
  const goToPreviousWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      return d
    })
  }
  const goToNextWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 7)
      return d
    })
  }

  const goToToday = () => {
    const now = new Date()
    const nowKey = toDateKey(now)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())

    setSelectedDateKey(nowKey)
    setSelectedEntryId(null)
    setPanelMode("detail")
    setFormError("")
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    setWeekStart(new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate()))
  }

  const selectDate = (dateKey) => {
    setSelectedDateKey(dateKey)
    setSelectedEntryId(null)
    setPanelMode("detail")
    setFormError("")
  }

  // Sync month view when a week-view day is selected
  const selectWeekDay = (dateKey) => {
    selectDate(dateKey)
    const d = fromDateKey(dateKey)
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  // ── Add entry ──────────────────────────────────────────────
  const handleOpenAddForm = () => {
    setAddFormValues(EMPTY_ENTRY_FORM)
    setFormError("")
    setPanelMode("add")
  }

  const handleCancelAdd = () => {
    setPanelMode("detail")
    setFormError("")
  }

  const handleAddFormChange = (e) => {
    const { name, value } = e.target
    setAddFormValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmitAdd = (e) => {
    e.preventDefault()
    if (!addFormValues.title.trim()) {
      setFormError("Title is required.")
      return
    }
    const newEntry = {
      id: generateId(),
      title: addFormValues.title.trim(),
      time: addFormValues.time.trim(),
      notes: addFormValues.notes.trim(),
    }
    const nextEntries = {
      ...entriesByDate,
      [selectedDateKey]: [...(entriesByDate[selectedDateKey] || []), newEntry],
    }
    persistEntries(nextEntries)
    setPanelMode("detail")
    setSelectedEntryId(newEntry.id)
    setFormError("")
  }

  // ── Edit entry ─────────────────────────────────────────────
  const handleOpenEditForm = (entry) => {
    setEditFormValues({ title: entry.title, time: entry.time || "", notes: entry.notes || "" })
    setFormError("")
    setSelectedEntryId(entry.id)
    setPanelMode("edit")
  }

  const handleCancelEdit = () => {
    setPanelMode("detail")
    setFormError("")
  }

  const handleEditFormChange = (e) => {
    const { name, value } = e.target
    setEditFormValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmitEdit = (e) => {
    e.preventDefault()
    if (!editFormValues.title.trim()) {
      setFormError("Title is required.")
      return
    }
    const nextEntries = {
      ...entriesByDate,
      [selectedDateKey]: (entriesByDate[selectedDateKey] || []).map((entry) =>
        entry.id === selectedEntryId
          ? { ...entry, title: editFormValues.title.trim(), time: editFormValues.time.trim(), notes: editFormValues.notes.trim() }
          : entry,
      ),
    }
    persistEntries(nextEntries)
    setPanelMode("detail")
    setFormError("")
  }

  // ── Delete entry ───────────────────────────────────────────
  const handleDeleteEntry = (entryId) => {
    const nextList = (entriesByDate[selectedDateKey] || []).filter((entry) => entry.id !== entryId)
    const nextEntries = { ...entriesByDate }
    if (nextList.length === 0) {
      delete nextEntries[selectedDateKey]
    } else {
      nextEntries[selectedDateKey] = nextList
    }
    persistEntries(nextEntries)
    if (selectedEntryId === entryId) {
      setSelectedEntryId(null)
      setPanelMode("detail")
    }
  }

  // ── Program event modal ────────────────────────────────────
  const handleOpenProgramModal = (entry) => {
    setProgramModalEntry(entry)
  }
  const handleCloseProgramModal = () => {
    setProgramModalEntry(null)
  }

  // ── Helpers ────────────────────────────────────────────────
  const hasProgramEntries = (dateKey) =>
    (entriesByDate[dateKey] || []).some((entry) => Boolean(entry.programId))

  return (
    <section className="page calendar-page">
      <header className="calendar-header">
        <div>
          <h1>Training Calendar</h1>
          <p>View your scheduled events by selecting a date.</p>
        </div>

        <div className="calendar-view-toggle" aria-label="Toggle calendar view">
          <button
            type="button"
            className={`calendar-view-btn${viewMode === "month" ? " is-active" : ""}`}
            onClick={() => setViewMode("month")}
          >
            Month
          </button>
          <button
            type="button"
            className={`calendar-view-btn${viewMode === "week" ? " is-active" : ""}`}
            onClick={() => setViewMode("week")}
          >
            Week
          </button>
        </div>

        <div className="calendar-nav-controls" aria-label={viewMode === "month" ? "Change month" : "Change week"}>
          <button type="button" onClick={viewMode === "month" ? goToPreviousMonth : goToPreviousWeek}>
            Prev
          </button>
          <p>{viewMode === "month" ? monthLabel : weekLabel}</p>
          <button type="button" onClick={viewMode === "month" ? goToNextMonth : goToNextWeek}>
            Next
          </button>
          <button type="button" className="calendar-today-btn" onClick={goToToday}>
            Today
          </button>
        </div>
      </header>

      {syncNotice ? (
        <p className="calendar-sync-notice" role="status">
          {syncNotice}
        </p>
      ) : null}

      <div className="calendar-layout">
        {/* ── Month view ── */}
        {viewMode === "month" ? (
          <section className="calendar-board" aria-label="Monthly calendar">
            <div className="calendar-weekdays">
              {dayLabels.map((label) => (
                <p key={label}>{label}</p>
              ))}
            </div>

            <div className="calendar-grid">
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return <div key={`empty-${index}`} className="calendar-cell calendar-cell-empty" aria-hidden="true" />
                }
                const entries = entriesByDate[cell.dateKey] || []
                const entryCount = entries.length
                const hasProgram = entries.some((e) => Boolean(e.programId))
                const isSelected = selectedDateKey === cell.dateKey
                const isToday = todayKey === cell.dateKey

                return (
                  <button
                    type="button"
                    key={cell.dateKey}
                    className={`calendar-cell${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                    onClick={() => selectDate(cell.dateKey)}
                  >
                    <span className="calendar-day-number">{cell.dateValue.getDate()}</span>
                    {entryCount > 0 ? (
                      <span className={`calendar-entry-count${hasProgram ? " has-program" : ""}`}>
                        {entryCount} item{entryCount !== 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>
        ) : (
          /* ── Week view ── */
          <section className="calendar-board" aria-label="Weekly calendar">
            <div className="calendar-weekdays">
              {weekDays.map(({ dateKey, dateValue }) => {
                const isToday = todayKey === dateKey
                const isSelected = selectedDateKey === dateKey
                return (
                  <button
                    type="button"
                    key={dateKey}
                    className={`calendar-week-day-header${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                    onClick={() => selectWeekDay(dateKey)}
                  >
                    <span className="calendar-week-label">{dayLabels[dateValue.getDay()]}</span>
                    <span className="calendar-week-date">{dateValue.getDate()}</span>
                  </button>
                )
              })}
            </div>

            <div className="calendar-week-body">
              {weekDays.map(({ dateKey }) => {
                const entries = entriesByDate[dateKey] || []
                const isSelected = selectedDateKey === dateKey
                return (
                  <div
                    key={dateKey}
                    className={`calendar-week-col${isSelected ? " is-selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${fromDateKey(dateKey).toLocaleDateString()}`}
                    onClick={() => selectWeekDay(dateKey)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectWeekDay(dateKey) }}
                  >
                    {entries.length === 0 ? (
                      <p className="calendar-week-empty">—</p>
                    ) : (
                      entries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={`calendar-week-entry${entry.programId ? " is-program" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (entry.programId) {
                              handleOpenProgramModal(entry)
                            } else {
                              selectWeekDay(dateKey)
                              setSelectedEntryId(entry.id)
                            }
                          }}
                          title={entry.title}
                        >
                          {entry.time ? <span className="calendar-week-entry-time">{entry.time}</span> : null}
                          <span className="calendar-week-entry-title">{entry.title}</span>
                          {entry.programId ? <span className="calendar-entry-program-badge">Program</span> : null}
                        </button>
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Aside panel ── */}
        <aside className="calendar-editor" aria-label="Selected date details">
          <div className="calendar-editor-heading">
            <h2>{selectedDateLabel}</h2>
            {panelMode === "detail" ? (
              <button type="button" className="calendar-add-btn" onClick={handleOpenAddForm}>
                + Add
              </button>
            ) : null}
          </div>

          {/* Detail panel */}
          {panelMode === "detail" ? (
            <>
              <section className="calendar-selected-details" aria-label="Selected event details">
                <h3>Event Details</h3>
                {!selectedEntry ? (
                  <p>Select an event below to view details, or add a new one.</p>
                ) : (
                  <div>
                    <p className="calendar-entry-title">{selectedEntry.title}</p>
                    <p className="calendar-entry-meta">{selectedEntry.time || "No time set"}</p>
                    <p className="calendar-entry-notes">{selectedEntry.notes || "No notes for this event."}</p>
                    {selectedEntry.programId ? (
                      <p className="calendar-entry-program-info">
                        <span className="calendar-entry-program-badge">Program</span>
                        {selectedEntry.programName || "Scheduled Program"}
                        {selectedEntry.weekNumber ? ` · Week ${selectedEntry.weekNumber}` : ""}
                      </p>
                    ) : null}
                    <div className="calendar-entry-actions">
                      {!selectedEntry.programId ? (
                        <button
                          type="button"
                          className="calendar-nav-controls"
                          onClick={() => handleOpenEditForm(selectedEntry)}
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="calendar-btn-delete"
                        onClick={() => handleDeleteEntry(selectedEntry.id)}
                      >
                        Delete
                      </button>
                      {selectedEntry.programId ? (
                        <button
                          type="button"
                          onClick={() => handleOpenProgramModal(selectedEntry)}
                        >
                          View Program
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>

              <div className="calendar-entry-list">
                <h3>Scheduled Items</h3>
                {selectedEntries.length === 0 ? (
                  <p className="calendar-empty-state">
                    Nothing scheduled for this day yet.{" "}
                    <button type="button" className="calendar-empty-add-link" onClick={handleOpenAddForm}>
                      Add an entry
                    </button>
                  </p>
                ) : (
                  <ul>
                    {selectedEntries.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className={`calendar-entry-item${selectedEntryId === entry.id ? " is-selected" : ""}${entry.programId ? " is-program" : ""}`}
                          onClick={() => {
                            setSelectedEntryId(entry.id)
                            if (entry.programId) {
                              handleOpenProgramModal(entry)
                            }
                          }}
                        >
                          <p className="calendar-entry-title">{entry.title}</p>
                          <p className="calendar-entry-meta">{entry.time || "No time set"}</p>
                          {entry.programId ? (
                            <span className="calendar-entry-program-badge">
                              {entry.programName ? `Program: ${entry.programName}` : "Program"}
                            </span>
                          ) : null}
                          {!entry.programId && entry.notes ? (
                            <p className="calendar-entry-notes">{entry.notes}</p>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}

          {/* Add form */}
          {panelMode === "add" ? (
            <form className="calendar-form" onSubmit={handleSubmitAdd} aria-label="Add new entry">
              <h3>New Entry</h3>
              {formError ? <p className="calendar-form-error">{formError}</p> : null}

              <label htmlFor="add-title">Title</label>
              <input
                id="add-title"
                type="text"
                name="title"
                value={addFormValues.title}
                onChange={handleAddFormChange}
                placeholder="Workout title"
                autoFocus
                required
              />

              <label htmlFor="add-time">Time (optional)</label>
              <input
                id="add-time"
                type="time"
                name="time"
                value={addFormValues.time}
                onChange={handleAddFormChange}
              />

              <label htmlFor="add-notes">Notes (optional)</label>
              <textarea
                id="add-notes"
                name="notes"
                value={addFormValues.notes}
                onChange={handleAddFormChange}
                placeholder="Any notes for this workout..."
                rows={3}
              />

              <div className="calendar-form-actions">
                <button type="submit">Save Entry</button>
                <button type="button" className="calendar-btn-secondary" onClick={handleCancelAdd}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {/* Edit form */}
          {panelMode === "edit" ? (
            <form className="calendar-form" onSubmit={handleSubmitEdit} aria-label="Edit entry">
              <h3>Edit Entry</h3>
              {formError ? <p className="calendar-form-error">{formError}</p> : null}

              <label htmlFor="edit-title">Title</label>
              <input
                id="edit-title"
                type="text"
                name="title"
                value={editFormValues.title}
                onChange={handleEditFormChange}
                placeholder="Workout title"
                autoFocus
                required
              />

              <label htmlFor="edit-time">Time (optional)</label>
              <input
                id="edit-time"
                type="time"
                name="time"
                value={editFormValues.time}
                onChange={handleEditFormChange}
              />

              <label htmlFor="edit-notes">Notes (optional)</label>
              <textarea
                id="edit-notes"
                name="notes"
                value={editFormValues.notes}
                onChange={handleEditFormChange}
                placeholder="Any notes for this workout..."
                rows={3}
              />

              <div className="calendar-form-actions">
                <button type="submit">Save Changes</button>
                <button type="button" className="calendar-btn-secondary" onClick={handleCancelEdit}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </aside>
      </div>

      {/* ── Program event detail modal ── */}
      {programModalEntry ? (
        <div
          className="calendar-modal-backdrop"
          role="presentation"
          onClick={handleCloseProgramModal}
        >
          <div
            className="calendar-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Program event details"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="calendar-modal-header">
              <h2>{programModalEntry.title}</h2>
              <button
                type="button"
                className="calendar-modal-close-btn"
                onClick={handleCloseProgramModal}
                aria-label="Close program details"
              >
                ✕
              </button>
            </header>

            <div className="calendar-modal-body">
              <p className="calendar-entry-program-badge">
                {programModalEntry.programName || "Scheduled Program"}
              </p>

              {programModalEntry.weekNumber ? (
                <p className="calendar-modal-detail">
                  <strong>Week:</strong> {programModalEntry.weekNumber}
                </p>
              ) : null}

              {programModalEntry.time ? (
                <p className="calendar-modal-detail">
                  <strong>Time:</strong> {programModalEntry.time}
                </p>
              ) : null}

              {programModalEntry.notes ? (
                <p className="calendar-modal-detail">
                  <strong>Notes:</strong> {programModalEntry.notes}
                </p>
              ) : null}

              {Array.isArray(programModalEntry.exerciseIds) && programModalEntry.exerciseIds.length > 0 ? (
                <div className="calendar-modal-exercises">
                  <h3>Exercises This Week</h3>
                  <ul>
                    {programModalEntry.exerciseIds.map((exId) => (
                      <li key={exId}>
                        {programModalEntry.exerciseNames?.[exId] || `Exercise #${exId}`}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="calendar-modal-actions">
                <button
                  type="button"
                  className="calendar-btn-delete"
                  onClick={() => {
                    handleDeleteEntry(programModalEntry.id)
                    handleCloseProgramModal()
                  }}
                >
                  Remove from Calendar
                </button>
                <button type="button" onClick={handleCloseProgramModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default Calendar
