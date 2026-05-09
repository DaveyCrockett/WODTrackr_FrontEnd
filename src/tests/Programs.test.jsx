import { describe, it, expect, beforeEach, vi } from "vitest"
import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axios from "axios"
import Programs from "../components/Programs"

vi.mock("axios")
vi.mock("../CSS/programs.css")

const API_URL = "/api/wodtrackr/exercise-programs/"

const mockProgram = {
  id: 1,
  name: "Strength Cycle",
  description: "Base strength training",
  difficulty: "Beginner",
  duration_weeks: 8,
  category: "Strength",
  goal: "Build Strength",
  is_public: true,
  created_by_username: "coach",
}

const mockChoicesResponse = {
  data: {
    category: ["Strength"],
    goal: ["Build Strength"],
    difficulty: ["Beginner"],
    duration_weeks: { min: 1, max: 12 },
  },
}

describe("Programs Component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  it("opens details modal from View Details and updates a program", async () => {
    axios.get.mockImplementation((url) => {
      if (url === API_URL) return Promise.resolve({ data: { data: [mockProgram] } })
      if (url === `${API_URL}choices/`) return Promise.resolve(mockChoicesResponse)
      if (url === `${API_URL}1/`) {
        return Promise.resolve({
          data: { ...mockProgram, exercises: [{ id: 101 }], updated_at: "2025-01-01T00:00:00Z" },
        })
      }
      return Promise.resolve({ data: {} })
    })
    axios.patch.mockResolvedValue({ data: { ...mockProgram, name: "Updated Strength Cycle" } })

    render(<Programs />)

    await screen.findByText("Strength Cycle")
    await userEvent.click(screen.getByRole("button", { name: "View Details" }))

    const dialog = await screen.findByRole("dialog")
    const nameInput = await screen.findByRole("textbox", { name: "Name" })
    expect(dialog).toBeInTheDocument()
    expect(nameInput).toHaveValue("Strength Cycle")

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "Updated Strength Cycle")
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(axios.patch).toHaveBeenCalledWith(
        `${API_URL}1/`,
        expect.objectContaining({ name: "Updated Strength Cycle" }),
        expect.anything(),
      )
    })
  })

  it("deletes a program from details modal", async () => {
    axios.get.mockImplementation((url) => {
      if (url === API_URL) return Promise.resolve({ data: { data: [mockProgram] } })
      if (url === `${API_URL}choices/`) return Promise.resolve(mockChoicesResponse)
      if (url === `${API_URL}1/`) return Promise.resolve({ data: { ...mockProgram, exercises: [] } })
      return Promise.resolve({ data: {} })
    })
    axios.delete.mockResolvedValue({ status: 204 })

    render(<Programs />)

    await screen.findByText("Strength Cycle")
    await userEvent.click(screen.getByRole("button", { name: "View Details" }))
    await screen.findByRole("dialog")

    await userEvent.click(screen.getByRole("button", { name: "Delete Program" }))

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith(`${API_URL}1/`, expect.anything())
    })
    await waitFor(() => {
      expect(screen.queryByText("Strength Cycle")).not.toBeInTheDocument()
    })
  })
})
