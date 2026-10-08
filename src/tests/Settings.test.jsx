import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import Settings from "../components/Settings"

describe("Settings", () => {
  beforeEach(() => {
    const storage = {}

    localStorage.clear = vi.fn(() => {
      Object.keys(storage).forEach((key) => delete storage[key])
    })
    localStorage.getItem = vi.fn((key) => (key in storage ? storage[key] : null))
    localStorage.setItem = vi.fn((key, value) => {
      storage[key] = String(value)
    })
    localStorage.removeItem = vi.fn((key) => {
      delete storage[key]
    })

    localStorage.setItem("wodtrackrUser", JSON.stringify({ username: "Coach Quinn", email: "coach@example.com" }))
  })

  it("persists preference updates and resets them to defaults", async () => {
    const user = userEvent.setup()

    render(<Settings />)

    const themeSelect = screen.getByLabelText("Theme")
    await user.selectOptions(themeSelect, "dark")
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")

    const reminders = screen.getByLabelText("Workout Reminders")
    await user.click(reminders)

    await user.click(screen.getByRole("button", { name: "Save Preferences" }))

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("wodtrackrPreferences"))).toMatchObject({
        theme: "dark",
        workoutReminders: false,
      })
    })

    await user.click(screen.getByRole("button", { name: "Reset to defaults" }))

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("wodtrackrPreferences"))).toMatchObject({
        theme: "light",
        language: "en",
        workoutReminders: true,
      })
    })

    expect(screen.getByLabelText("Theme")).toHaveValue("light")
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
  })

  it("updates profile details and saves them to localStorage", async () => {
    const user = userEvent.setup()

    render(<Settings />)
    await user.click(screen.getByRole("tab", { name: "Account Settings" }))

    const nameInput = screen.getByLabelText("Full name")
    await user.clear(nameInput)
    await user.type(nameInput, "Alex Morgan")

    const bioInput = screen.getByLabelText("Bio")
    await user.clear(bioInput)
    await user.type(bioInput, "Strength-focused and consistent.")

    await user.click(screen.getByRole("button", { name: "Save profile" }))

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("wodtrackrProfile"))).toMatchObject({
        name: "Alex Morgan",
        bio: "Strength-focused and consistent.",
      })
    })

    expect(JSON.parse(localStorage.getItem("wodtrackrUser")).username).toBe("Alex Morgan")
  })
})
