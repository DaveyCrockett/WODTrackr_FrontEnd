import { describe, it, expect, beforeEach, vi } from "vitest"
import React from "react"
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Calendar from "../components/Calendar"

vi.mock("../CSS/calendar.css")

const STORAGE_KEY = "wodtrackrCalendarEntries"
const LEGACY_SCHEDULED_PROGRAMS_KEY = "wodtrackrScheduledPrograms"

describe("Calendar Component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockImplementation(() => {})
  })

  it("renders month view with today highlighted", () => {
    render(<Calendar />)
    expect(screen.getByText("Training Calendar")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Month" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument()
    // Today's date number should be visible in the month grid
    const today = new Date()
    expect(screen.getByText(String(today.getDate()), { selector: ".calendar-day-number" })).toBeInTheDocument()
  })

  it("toggles between month and week views", async () => {
    render(<Calendar />)
    expect(screen.getByRole("region", { name: "Monthly calendar" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Week" }))
    expect(screen.getByRole("region", { name: "Weekly calendar" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Month" }))
    expect(screen.getByRole("region", { name: "Monthly calendar" })).toBeInTheDocument()
  })

  it("shows 'Add' button in the aside panel", () => {
    render(<Calendar />)
    expect(screen.getByRole("button", { name: "+ Add" })).toBeInTheDocument()
  })

  it("opens add form when Add button is clicked", async () => {
    render(<Calendar />)
    await userEvent.click(screen.getByRole("button", { name: "+ Add" }))
    expect(screen.getByRole("form", { name: "Add new entry" })).toBeInTheDocument()
    expect(screen.getByLabelText("Title")).toBeInTheDocument()
  })

  it("adds a new entry to the selected date", async () => {
    render(<Calendar />)
    await userEvent.click(screen.getByRole("button", { name: "+ Add" }))

    const titleInput = screen.getByLabelText("Title")
    await userEvent.type(titleInput, "Morning Run")
    await userEvent.click(screen.getByRole("button", { name: "Save Entry" }))

    // Entry title appears in both the detail panel and the list - check at least one
    const allTitles = await screen.findAllByText("Morning Run")
    expect(allTitles.length).toBeGreaterThanOrEqual(1)
    expect(vi.mocked(localStorage.setItem)).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining("Morning Run"),
    )
  })

  it("shows form error when title is empty on add", async () => {
    render(<Calendar />)
    await userEvent.click(screen.getByRole("button", { name: "+ Add" }))
    // submit the form directly to ensure the onSubmit handler fires
    const form = screen.getByRole("form", { name: "Add new entry" })
    fireEvent.submit(form)

    expect(await screen.findByText("Title is required.")).toBeInTheDocument()
  })

  it("cancels add form and returns to detail panel", async () => {
    render(<Calendar />)
    await userEvent.click(screen.getByRole("button", { name: "+ Add" }))
    expect(screen.getByRole("form", { name: "Add new entry" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("form", { name: "Add new entry" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "+ Add" })).toBeInTheDocument()
  })

  it("loads existing entries from localStorage on mount", async () => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const stored = {
      [dateKey]: [{ id: "abc123", title: "Stored Workout", time: "07:00", notes: "Warm up first" }],
    }
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === STORAGE_KEY) return JSON.stringify(stored)
      return null
    })

    render(<Calendar />)
    expect(await screen.findByText("Stored Workout")).toBeInTheDocument()
  })

  it("loads scheduled program entries from legacy scheduled storage key", async () => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const storedProgramEntries = {
      [dateKey]: [
        {
          id: "legacy-prog-1",
          title: "Legacy Program - Week 1",
          time: "",
          notes: "",
          programId: 88,
          programName: "Legacy Program",
          weekNumber: 1,
          exerciseIds: [101],
        },
      ],
    }

    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === STORAGE_KEY) return null
      if (key === LEGACY_SCHEDULED_PROGRAMS_KEY) return JSON.stringify(storedProgramEntries)
      return null
    })

    render(<Calendar />)
    expect(await screen.findByText("Legacy Program - Week 1")).toBeInTheDocument()
    expect(screen.getByText(/Program: Legacy Program/)).toBeInTheDocument()
  })

  it("shows entry details when an entry is selected", async () => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const stored = {
      [dateKey]: [{ id: "abc123", title: "CrossFit WOD", time: "09:00", notes: "Hard session" }],
    }
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === STORAGE_KEY) return JSON.stringify(stored)
      return null
    })

    render(<Calendar />)
    const entryBtn = await screen.findByRole("button", { name: /CrossFit WOD/ })
    await userEvent.click(entryBtn)

    const details = screen.getByRole("region", { name: "Selected event details" })
    expect(within(details).getByText("CrossFit WOD")).toBeInTheDocument()
    expect(within(details).getByText("09:00")).toBeInTheDocument()
    expect(within(details).getByText("Hard session")).toBeInTheDocument()
  })

  it("deletes an entry when Delete is clicked", async () => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const stored = {
      [dateKey]: [{ id: "del1", title: "Delete Me", time: "", notes: "" }],
    }
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === STORAGE_KEY) return JSON.stringify(stored)
      return null
    })

    render(<Calendar />)
    const entryBtn = await screen.findByRole("button", { name: /Delete Me/ })
    await userEvent.click(entryBtn)

    const details = screen.getByRole("region", { name: "Selected event details" })
    const deleteBtn = within(details).getByRole("button", { name: "Delete" })
    await userEvent.click(deleteBtn)

    await waitFor(() => {
      expect(screen.queryByText("Delete Me")).not.toBeInTheDocument()
    })
    expect(vi.mocked(localStorage.setItem)).toHaveBeenCalled()
  })

  it("opens edit form when Edit is clicked", async () => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const stored = {
      [dateKey]: [{ id: "ed1", title: "Edit This", time: "08:00", notes: "Original notes" }],
    }
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === STORAGE_KEY) return JSON.stringify(stored)
      return null
    })

    render(<Calendar />)
    await userEvent.click(await screen.findByRole("button", { name: /Edit This/ }))

    const details = screen.getByRole("region", { name: "Selected event details" })
    await userEvent.click(within(details).getByRole("button", { name: "Edit" }))

    const editForm = screen.getByRole("form", { name: "Edit entry" })
    expect(editForm).toBeInTheDocument()
    expect(screen.getByLabelText("Title")).toHaveValue("Edit This")
  })

  it("saves edited entry", async () => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const stored = {
      [dateKey]: [{ id: "ed2", title: "Before Edit", time: "", notes: "" }],
    }
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === STORAGE_KEY) return JSON.stringify(stored)
      return null
    })

    render(<Calendar />)
    await userEvent.click(await screen.findByRole("button", { name: /Before Edit/ }))
    const details = screen.getByRole("region", { name: "Selected event details" })
    await userEvent.click(within(details).getByRole("button", { name: "Edit" }))

    const titleInput = screen.getByLabelText("Title")
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, "After Edit")
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      // "Before Edit" should be gone; "After Edit" may appear in multiple places (list + details)
      expect(screen.queryByText("Before Edit")).not.toBeInTheDocument()
      const afterEdits = screen.getAllByText("After Edit")
      expect(afterEdits.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("shows program badge on program-sourced entries", async () => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const stored = {
      [dateKey]: [
        {
          id: "prog1",
          title: "Strength Cycle – Week 1",
          time: "",
          notes: "",
          programId: 42,
          programName: "Strength Cycle",
          weekNumber: 1,
          exerciseIds: [101, 102],
        },
      ],
    }
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === STORAGE_KEY) return JSON.stringify(stored)
      return null
    })

    render(<Calendar />)
    await screen.findByText("Strength Cycle – Week 1")
    expect(screen.getByText(/Program: Strength Cycle/)).toBeInTheDocument()
  })

  it("opens program detail modal when a program entry is clicked", async () => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const stored = {
      [dateKey]: [
        {
          id: "prog2",
          title: "Cardio Blast – Week 3",
          time: "",
          notes: "Interval training",
          programId: 7,
          programName: "Cardio Blast",
          weekNumber: 3,
          exerciseIds: [50],
        },
      ],
    }
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === STORAGE_KEY) return JSON.stringify(stored)
      return null
    })

    render(<Calendar />)
    await userEvent.click(await screen.findByRole("button", { name: /Cardio Blast – Week 3/ }))

    const modal = screen.getByRole("dialog", { name: "Program event details" })
    expect(modal).toBeInTheDocument()
    expect(within(modal).getByText("Cardio Blast – Week 3")).toBeInTheDocument()
    expect(within(modal).getByText(/Week:/)).toBeInTheDocument()
  })

  it("closes program detail modal when Close is clicked", async () => {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const stored = {
      [dateKey]: [
        { id: "prog3", title: "Program Entry", time: "", notes: "", programId: 5, programName: "Test Program", weekNumber: 1, exerciseIds: [] },
      ],
    }
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === STORAGE_KEY) return JSON.stringify(stored)
      return null
    })

    render(<Calendar />)
    await userEvent.click(await screen.findByRole("button", { name: /Program Entry/ }))
    expect(screen.getByRole("dialog", { name: "Program event details" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Close program details" }))
    expect(screen.queryByRole("dialog", { name: "Program event details" })).not.toBeInTheDocument()
  })

  it("navigates to previous and next month", async () => {
    render(<Calendar />)
    const today = new Date()
    const currentMonthLabel = today.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    expect(screen.getByText(currentMonthLabel)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Next" }))
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const nextLabel = nextMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    expect(screen.getByText(nextLabel)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Prev" }))
    expect(screen.getByText(currentMonthLabel)).toBeInTheDocument()
  })

  it("shows empty state message with add link when no entries", () => {
    render(<Calendar />)
    expect(screen.getByText(/Nothing scheduled for this day yet/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add an entry" })).toBeInTheDocument()
  })
})
