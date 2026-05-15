import { describe, it, expect, beforeEach, vi } from "vitest"
import React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
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
    equipment: { barbell: "Barbell" },
    duration_weeks: { min: 1, max: 12 },
  },
}

const buildWorkoutPlan = (weeks, exerciseId = 101) =>
  Array.from({ length: weeks }, (_, index) => ({
    week_number: index + 1,
    exercise_ids: [exerciseId],
  }))

describe("Programs Component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === "wodtrackrUser") {
        return JSON.stringify({ username: "coach", authToken: "token" })
      }
      return null
    })
  })

  it("opens details modal from View Details and updates a program", async () => {
    const listedProgram = {
      ...mockProgram,
      duration_weeks: 1,
      equipment: ["barbell"],
      exercises: [{ id: 101 }],
      workout_plan: buildWorkoutPlan(1),
    }

    axios.get.mockImplementation((url) => {
      if (url === API_URL) return Promise.resolve({ data: { data: [listedProgram] } })
      if (url === `${API_URL}choices/`) return Promise.resolve(mockChoicesResponse)
      if (url === `${API_URL}1/`) {
        return Promise.resolve({
          data: {
            ...listedProgram,
            duration_weeks: 1,
            exercises: [{ id: 101 }],
            workout_plan: buildWorkoutPlan(1),
            updated_at: "2025-01-01T00:00:00Z",
          },
        })
      }
      if (url === `${API_URL}1/item/`) {
        return Promise.resolve({ data: { data: [{ id: 1, exercise: 101, week: 1, day: 1 }] } })
      }
      return Promise.resolve({ data: {} })
    })
    axios.put.mockResolvedValue({ data: { ...mockProgram, name: "Updated Strength Cycle" } })

    render(<Programs />)

    await screen.findByText("Strength Cycle")
    await userEvent.click(screen.getByRole("button", { name: "View Details" }))

    const dialog = await screen.findByRole("dialog")
    await userEvent.click(screen.getByRole("button", { name: "Edit Program" }))
    const nameInput = await screen.findByRole("textbox", { name: "Name" })
    expect(dialog).toBeInTheDocument()
    expect(nameInput).toHaveValue("Strength Cycle")

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "Updated Strength Cycle")
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(
        `${API_URL}1/`,
        expect.objectContaining({ name: "Updated Strength Cycle", equipment: ["barbell"] }),
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
    await userEvent.click(screen.getByRole("button", { name: "Edit Program" }))

    await userEvent.click(screen.getByRole("button", { name: "Delete Program" }))

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith(`${API_URL}1/`, expect.anything())
    })
    await waitFor(() => {
      expect(screen.queryByText("Strength Cycle")).not.toBeInTheDocument()
    })
  })

  it("creates a program with selected workout exercises", async () => {
    axios.get.mockImplementation((url) => {
      if (url === API_URL) return Promise.resolve({ data: { data: [mockProgram] } })
      if (url === `${API_URL}choices/`) return Promise.resolve(mockChoicesResponse)
      if (url === "/api/wodtrackr/exercises/") {
        return Promise.resolve({ data: { data: [{ id: 101, name: "Back Squat" }] } })
      }
      return Promise.resolve({ data: {} })
    })
    axios.post.mockResolvedValue({ data: { data: { ...mockProgram, id: 2, name: "Plan Builder" } } })

    render(<Programs />)

    await screen.findByText("Strength Cycle")
    await userEvent.click(screen.getByRole("button", { name: "New Program" }))
    const createDialog = await screen.findByRole("dialog", { name: "Create New Program" })

    await userEvent.type(within(createDialog).getByRole("textbox", { name: "Name" }), "Plan Builder")
    await userEvent.type(within(createDialog).getByRole("textbox", { name: "Description" }), "Includes structured sessions")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Difficulty" }), "Beginner")
    await userEvent.type(within(createDialog).getByRole("spinbutton", { name: "Duration \(weeks\)" }), "2")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Category" }), "Strength")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Goal" }), "Build Strength")
    await userEvent.click(within(createDialog).getByRole("button", { name: "Equipment" }))
    await userEvent.click(within(createDialog).getByRole("checkbox", { name: "Barbell" }))

    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Exercise" }), "101")
    await userEvent.click(within(createDialog).getByRole("button", { name: "Add Exercise" }))
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Week" }), "2")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Exercise" }), "101")
    await userEvent.click(within(createDialog).getByRole("button", { name: "Add Exercise" }))

    await userEvent.click(within(createDialog).getByRole("button", { name: "Create Program" }))

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        API_URL,
        expect.objectContaining({
          name: "Plan Builder",
          equipment: ["barbell"],
          exercises: [101],
        }),
        expect.anything(),
      )
    })
  })

  it("prevents creating a program without any workout plan exercises", async () => {
    axios.get.mockImplementation((url) => {
      if (url === API_URL) return Promise.resolve({ data: { data: [mockProgram] } })
      if (url === `${API_URL}choices/`) return Promise.resolve(mockChoicesResponse)
      if (url === "/api/wodtrackr/exercises/") {
        return Promise.resolve({ data: { data: [{ id: 101, name: "Back Squat" }] } })
      }
      return Promise.resolve({ data: {} })
    })

    render(<Programs />)

    await screen.findByText("Strength Cycle")
    await userEvent.click(screen.getByRole("button", { name: "New Program" }))
    const createDialog = await screen.findByRole("dialog", { name: "Create New Program" })

    await userEvent.type(within(createDialog).getByRole("textbox", { name: "Name" }), "Plan Builder")
    await userEvent.type(within(createDialog).getByRole("textbox", { name: "Description" }), "Includes structured sessions")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Difficulty" }), "Beginner")
    await userEvent.type(within(createDialog).getByRole("spinbutton", { name: "Duration (weeks)" }), "2")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Category" }), "Strength")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Goal" }), "Build Strength")

    await userEvent.click(within(createDialog).getByRole("button", { name: "Create Program" }))

    expect(axios.post).not.toHaveBeenCalled()
    expect(await screen.findByText("Add at least 1 workout to your program.")).toBeInTheDocument()
  })

  it("prevents creating a program when any workout week is empty", async () => {
    axios.get.mockImplementation((url) => {
      if (url === API_URL) return Promise.resolve({ data: { data: [mockProgram] } })
      if (url === `${API_URL}choices/`) return Promise.resolve(mockChoicesResponse)
      if (url === "/api/wodtrackr/exercises/") {
        return Promise.resolve({ data: { data: [{ id: 101, name: "Back Squat" }] } })
      }
      return Promise.resolve({ data: {} })
    })

    render(<Programs />)

    await screen.findByText("Strength Cycle")
    await userEvent.click(screen.getByRole("button", { name: "New Program" }))
    const createDialog = await screen.findByRole("dialog", { name: "Create New Program" })

    await userEvent.type(within(createDialog).getByRole("textbox", { name: "Name" }), "Plan Builder")
    await userEvent.type(within(createDialog).getByRole("textbox", { name: "Description" }), "Includes structured sessions")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Difficulty" }), "Beginner")
    await userEvent.type(within(createDialog).getByRole("spinbutton", { name: "Duration (weeks)" }), "2")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Category" }), "Strength")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Goal" }), "Build Strength")
    await userEvent.selectOptions(within(createDialog).getByRole("combobox", { name: "Exercise" }), "101")
    await userEvent.click(within(createDialog).getByRole("button", { name: "Add Exercise" }))
    await userEvent.click(within(createDialog).getByRole("button", { name: "Create Program" }))

    expect(axios.post).not.toHaveBeenCalled()
    expect(await screen.findByText("Each week in the workout plan must include at least 1 exercise.")).toBeInTheDocument()
  })
})
