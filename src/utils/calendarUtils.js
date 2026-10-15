export const CALENDAR_STORAGE_KEY = "wodtrackrCalendarEntries"
export const CALENDAR_STORAGE_EVENT = "wodtrackr:calendarEntriesUpdated"
export const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export const toDateKey = (dateValue) => {
  const year = dateValue.getFullYear()
  const month = String(dateValue.getMonth() + 1).padStart(2, "0")
  const day = String(dateValue.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const fromDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export const getCalendarEntries = () => {
  try {
    const storedValue = localStorage.getItem(CALENDAR_STORAGE_KEY)
    if (!storedValue) {
      return {}
    }

    const parsed = JSON.parse(storedValue)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export const saveCalendarEntries = (entriesByDate) => {
  localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(entriesByDate))
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CALENDAR_STORAGE_EVENT))
  }
}

export const getStartOfWeek = (dateValue) => {
  const startOfWeek = new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate())
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  return startOfWeek
}

export const getWeekDates = (anchorDate) => {
  const startOfWeek = getStartOfWeek(anchorDate)
  return Array.from({ length: 7 }, (_, index) => {
    const dateValue = new Date(startOfWeek)
    dateValue.setDate(startOfWeek.getDate() + index)
    return dateValue
  })
}

export const isDateInSameWeek = (dateValue, anchorDate) => {
  const dateKey = toDateKey(dateValue)
  return getWeekDates(anchorDate).some((weekDate) => toDateKey(weekDate) === dateKey)
}
