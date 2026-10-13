import { describe, it, expect, beforeEach, vi } from "vitest"
import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axios from "axios"
import Exercises from "../components/Exercises"

vi.mock("axios")
vi.mock("../CSS/exercises.css")

const mockNavigate = vi.fn()
let mockSearchParams = new URLSearchParams("source=new-program&newProgram=true&planWeek=2&planWodKey=wod-123")

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, vi.fn()],
  }
})

describe("Exercises program builder navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    axios.get.mockResolvedValue({ data: { data: [] } })
    axios.options.mockResolvedValue({ data: {} })
  })

  it("preserves selected WOD key when adding selected exercises", async () => {
    mockSearchParams = new URLSearchParams("source=new-program&newProgram=true&planWeek=2&planWodKey=wod-123")

    render(<Exercises userSession={{ username: "" }} exerciseIsAdded={[101]} setExerciseIsAdded={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add Selected (1)" })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole("button", { name: "Add Selected (1)" }))

    expect(mockNavigate).toHaveBeenCalledWith(
      "/programs?newProgram=true&planWeek=2&applyAddedExercises=true&planWodKey=wod-123",
    )
  })

  it("does not append an empty WOD key when returning to the program builder", async () => {
    mockSearchParams = new URLSearchParams("source=new-program&newProgram=true&planWeek=3")

    render(<Exercises userSession={{ username: "" }} exerciseIsAdded={[7]} setExerciseIsAdded={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Back To Program" })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole("button", { name: "Back To Program" }))

    expect(mockNavigate).toHaveBeenCalledWith("/programs?newProgram=true&planWeek=3")
  })
})
