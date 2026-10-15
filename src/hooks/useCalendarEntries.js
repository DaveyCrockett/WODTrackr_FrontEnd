import { useCallback, useEffect, useState } from "react"
import { CALENDAR_STORAGE_EVENT, CALENDAR_STORAGE_KEY, getCalendarEntries } from "../utils/calendarUtils"

function useCalendarEntries() {
  const [entriesByDate, setEntriesByDate] = useState(() => getCalendarEntries())

  const refreshEntries = useCallback(() => {
    setEntriesByDate(getCalendarEntries())
  }, [])

  useEffect(() => {
    const handleStorage = (event) => {
      if (!event.key || event.key === CALENDAR_STORAGE_KEY) {
        refreshEntries()
      }
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener(CALENDAR_STORAGE_EVENT, refreshEntries)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(CALENDAR_STORAGE_EVENT, refreshEntries)
    }
  }, [refreshEntries])

  return [entriesByDate, setEntriesByDate]
}

export default useCalendarEntries
