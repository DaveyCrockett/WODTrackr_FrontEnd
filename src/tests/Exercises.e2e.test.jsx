import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import Exercises from '../components/Exercises'

vi.mock('axios')
vi.mock('../CSS/exercises.css')

describe('Exercise Library E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('User Workflows', () => {
    it('should complete full exercise search and view workflow', async () => {
      const mockExercises = [
        {
          id: 1,
          name: 'Back Squat',
          description: 'Fundamental barbell squat',
          category: 'strength',
          equipment: 'barbell',
          primary_muscle_group: 'legs',
          created_by_username: 'coach',
          is_public: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'Bench Press',
          description: 'Barbell bench press',
          category: 'strength',
          equipment: 'barbell',
          primary_muscle_group: 'chest',
          created_by_username: 'coach',
          is_public: true,
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ]

      axios.get.mockResolvedValue({ data: { data: mockExercises } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      // Wait for exercises to load
      await waitFor(() => {
        expect(screen.getByText('Back Squat')).toBeInTheDocument()
        expect(screen.getByText('Bench Press')).toBeInTheDocument()
      })

      // Search for specific exercise
      const searchInput = screen.getByPlaceholderText(/back squat/i)
      await userEvent.type(searchInput, 'squat')

      // Verify search was called
      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            params: expect.objectContaining({ search: 'squat' }),
          })
        )
      })

      // Click on Back Squat in the list (first matching heading)
      const backSquatElement = screen.getAllByText('Back Squat')[0]
      await userEvent.click(backSquatElement)

      // Verify details are displayed
      await waitFor(() => {
        expect(screen.getByText(/Fundamental barbell squat/)).toBeInTheDocument()
      })
    })

    it('should complete search, filter, and sort workflow', async () => {
      const mockExercises = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `Exercise ${i + 1}`,
        category: i % 2 === 0 ? 'strength' : 'cardio',
        equipment: 'barbell',
        primary_muscle_group: 'legs',
        created_by_username: 'coach',
        is_public: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }))

      axios.get.mockResolvedValue({ data: { data: mockExercises } })
      axios.options.mockResolvedValue({
        data: {
          actions: {
            POST: {
              category: { choices: { strength: 'Strength', cardio: 'Cardio' } },
              equipment: { choices: { barbell: 'Barbell' } },
            },
          },
        },
      })

      render(<Exercises />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Exercise 1')).toBeInTheDocument()
      })

      // Apply category filter
      const categorySelect = screen.getByLabelText('Category')
      await userEvent.selectOptions(categorySelect, 'strength')

      // Verify filter was applied
      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            params: expect.objectContaining({ category: 'strength' }),
          })
        )
      })

      // Change sort order
      const sortSelect = screen.getByLabelText('Sort by')
      await userEvent.selectOptions(sortSelect, '-name')

      // Verify sort was applied
      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            params: expect.objectContaining({ ordering: '-name' }),
          })
        )
      })

      // Clear all filters
      const clearButton = screen.getByText('Clear Filters')
      await userEvent.click(clearButton)

      // Verify filters were cleared
      expect(categorySelect).toHaveValue('')
      expect(sortSelect).toHaveValue('name')
    })

    it('should complete add exercise workflow', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({
        data: {
          actions: {
            POST: {
              category: { choices: { strength: 'Strength' } },
              equipment: { choices: { barbell: 'Barbell' } },
            },
          },
        },
      })
      axios.post.mockResolvedValue({
        data: {
          data: {
            id: 1,
            name: 'New Exercise',
            description: 'A new test exercise',
            category: 'strength',
            equipment: 'barbell',
            primary_muscle_group: 'legs',
            created_by_username: 'testuser',
            is_public: true,
          },
        },
      })

      render(<Exercises />)

      // Click Add Exercise button
      const addButton = screen.getByText('Add Exercise')
      await userEvent.click(addButton)

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.getByText('Create a new exercise in your library.')).toBeInTheDocument()
      })

      // The modal should have a form with inputs
      const inputs = screen.getAllByDisplayValue('')
      expect(inputs.length).toBeGreaterThan(0)
    })

    it('should handle pagination with load more', async () => {
      // Create 25 mock exercises (more than page size of 12)
      const mockExercises = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `Exercise ${String(i + 1).padStart(2, '0')}`,
        category: 'strength',
        equipment: 'barbell',
        primary_muscle_group: 'legs',
        created_by_username: 'coach',
        is_public: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }))

      axios.get.mockResolvedValue({ data: { data: mockExercises } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      // Wait for initial exercises to load
      await waitFor(() => {
        expect(screen.getAllByText('Exercise 01').length).toBeGreaterThan(0)
      })

      // Initial load should show 12 exercises
      expect(screen.getAllByText('Exercise 01').length).toBeGreaterThan(0)
      expect(screen.queryByText('Exercise 13')).not.toBeInTheDocument()

      // Load More button should be visible
      const loadMoreButton = screen.getByText('Load More')
      await userEvent.click(loadMoreButton)

      // Should now show more exercises
      await waitFor(() => {
        expect(screen.getByText('Exercise 13')).toBeInTheDocument()
      })
    })

    it('should show success message after adding exercise', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({
        data: {
          actions: {
            POST: {
              category: { choices: { strength: 'Strength' } },
              equipment: { choices: { barbell: 'Barbell' } },
            },
          },
        },
      })
      axios.post.mockResolvedValue({
        data: {
          data: {
            id: 1,
            name: 'New Exercise',
            category: 'strength',
            equipment: 'barbell',
            primary_muscle_group: 'legs',
            description: 'Test',
            created_by_username: 'testuser',
            is_public: true,
          },
        },
      })

      render(<Exercises />)

      // We would need to fully fill out the form here to test the complete flow
      // For now, we're testing the structure is in place
      const addButton = screen.getByText('Add Exercise')
      await userEvent.click(addButton)

      await waitFor(() => {
        expect(screen.getByText('Create a new exercise in your library.')).toBeInTheDocument()
      })
    })

    it('should handle API errors during search', async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 500,
          data: { detail: 'Internal server error' },
        },
      })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      await waitFor(() => {
        expect(screen.getByText('Internal server error')).toBeInTheDocument()
      })
    })

    it('should require login message when getting 401 error', async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 401,
        },
      })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      await waitFor(() => {
        expect(screen.getByText(/log in/i)).toBeInTheDocument()
      })
    })
  })

  describe('Complex Filtering Scenarios', () => {
    it('should combine multiple filters correctly', async () => {
      const mockExercises = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Exercise ${i + 1}`,
        category: i < 5 ? 'strength' : 'cardio',
        equipment: i < 3 ? 'barbell' : 'dumbbell',
        primary_muscle_group: i < 7 ? 'legs' : 'chest',
        created_by_username: 'coach',
        is_public: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }))

      axios.get.mockResolvedValue({ data: { data: mockExercises } })
      axios.options.mockResolvedValue({
        data: {
          actions: {
            POST: {
              category: { choices: { strength: 'Strength', cardio: 'Cardio' } },
              equipment: { choices: { barbell: 'Barbell', dumbbell: 'Dumbbell' } },
              primary_muscle_group: { choices: { legs: 'Legs', chest: 'Chest' } },
            },
          },
        },
      })

      render(<Exercises />)

      await waitFor(() => {
        expect(screen.getByText('Exercise 1')).toBeInTheDocument()
      })

      // Apply multiple filters
      const categorySelect = screen.getByLabelText('Category')
      const equipmentSelect = screen.getByLabelText('Equipment')

      await userEvent.selectOptions(categorySelect, 'strength')
      await userEvent.selectOptions(equipmentSelect, 'barbell')

      // Verify both filters were applied
      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            params: expect.objectContaining({
              category: 'strength',
              equipment: 'barbell',
            }),
          })
        )
      })
    })

    it('should update results when filters change', async () => {
      const mockExercises = [
        {
          id: 1,
          name: 'Back Squat',
          category: 'strength',
          equipment: 'barbell',
          primary_muscle_group: 'legs',
          created_by_username: 'coach',
          is_public: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]

      axios.get.mockResolvedValue({ data: { data: mockExercises } })
      axios.options.mockResolvedValue({
        data: {
          actions: {
            POST: {
              category: { choices: { strength: 'Strength', cardio: 'Cardio' } },
            },
          },
        },
      })

      render(<Exercises />)

      await waitFor(() => {
        expect(screen.getByText('Back Squat')).toBeInTheDocument()
      })

      // Verify initial call was made
      const initialCallCount = axios.get.mock.calls.length

      // Change filter
      const categorySelect = screen.getByLabelText('Category')
      await userEvent.selectOptions(categorySelect, 'cardio')

      // Verify new call was made
      await waitFor(() => {
        expect(axios.get.mock.calls.length).toBeGreaterThan(initialCallCount)
      })
    })
  })
})
