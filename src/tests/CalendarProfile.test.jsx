import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import Calendar from "../components/Calendar"
import Profile from "../components/Profile"

vi.mock("../assets/WODTrackr_Logo.png", () => ({ default: "logo.png" }))
vi.mock("../assets/CalendarIconBlack.png", () => ({ default: "calendar-icon.png" }))

const setCalendarStorage = (entriesByDate, user = { username: "athlete" }) => {
  vi.mocked(localStorage.getItem).mockImplementation((key) => {
    if (key === "wodtrackrCalendarEntries") {
      return JSON.stringify(entriesByDate)
    }

    if (key === "wodtrackrUser") {
      return JSON.stringify(user)
    }

    return null
  })
}

describe("Calendar/Profile weekly sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders the current week in profile using the same calendar storage data", () => {
    setCalendarStorage({
      "2026-03-01": [{ id: "sun-1", title: "Long Run", time: "07:00", notes: "Easy pace" }],
      "2026-03-02": [{ id: "mon-1", title: "Squat Session", time: "18:00", notes: "5x5" }],
      "2026-03-07": [{ id: "sat-1", title: "Recovery Swim", time: "09:00", notes: "20 laps" }],
    })

    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>,
    )

    const summary = screen.getByLabelText("Current week summary")

    expect(screen.getByText("Week at a Glance")).toBeInTheDocument()
    const workoutsThisWeek = within(summary).getByText("Workouts This Week").closest("div")

    expect(within(workoutsThisWeek).getByText("3")).toBeInTheDocument()
    expect(screen.getByText("Squat Session")).toBeInTheDocument()
    expect(screen.getByText("Recovery Swim")).toBeInTheDocument()
    expect(screen.getAllByText("No workout", { selector: "p" })).toHaveLength(4)
    expect(screen.getByRole("link", { name: "Open calendar page" })).toHaveAttribute("href", "/calendar")
  })

  it("opens workout details from the profile week view", () => {
    setCalendarStorage({
      "2026-03-01": [{ id: "sun-1", title: "Long Run", time: "07:00", notes: "Easy pace" }],
    })

    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole("button", { name: /Long Run/i }))

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Long Run")).toBeInTheDocument()
    expect(within(dialog).getByText("Easy pace")).toBeInTheDocument()
    expect(within(dialog).getByText("Sunday, March 1, 2026")).toBeInTheDocument()
  })

  it("highlights the current week on the calendar and opens workout details from a scheduled item", () => {
    setCalendarStorage({
      "2026-03-01": [{ id: "sun-1", title: "Long Run", time: "07:00", notes: "Easy pace" }],
    })

    const { container } = render(<Calendar />)

    const todayButton = screen.getByRole("button", { current: "date" })
    expect(todayButton).toHaveClass("is-current-week")

    fireEvent.click(screen.getByRole("button", { name: /Long Run/i }))

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Long Run")).toBeInTheDocument()
    expect(within(dialog).getByText("Easy pace")).toBeInTheDocument()
    expect(container.querySelector(".calendar-cell.is-current-week")).not.toBeNull()
  })
})
