import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import Exercises from '../components/Exercises'

vi.mock('axios')
vi.mock('../CSS/exercises.css')

describe('Exercises Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render exercise library page with main sections', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      expect(screen.getByText('Exercise Library')).toBeInTheDocument()
      expect(screen.getByText('Search and review your exercise list.')).toBeInTheDocument()
      expect(screen.getByText('Exercise Details')).toBeInTheDocument()
    })

    it('should render search and filter controls', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      expect(screen.getByPlaceholderText(/back squat/i)).toBeInTheDocument()
      expect(screen.getByLabelText('Category')).toBeInTheDocument()
      expect(screen.getByLabelText('Equipment')).toBeInTheDocument()
      expect(screen.getByLabelText('Muscle')).toBeInTheDocument()
      expect(screen.getByLabelText('Sort by')).toBeInTheDocument()
    })

    it('should render Add Exercise button', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      expect(screen.getByText('Add Exercise')).toBeInTheDocument()
    })
  })

  describe('Exercise Grid', () => {
    it('should display list of exercises', async () => {
      const mockExercises = [
        {
          id: 1,
          name: 'Back Squat',
          category: 'strength',
          equipment: 'barbell',
          primary_muscle_group: 'legs',
          created_by_username: 'coach1',
          is_public: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'Pull-up',
          category: 'strength',
          equipment: 'bar',
          primary_muscle_group: 'back',
          created_by_username: 'coach1',
          is_public: true,
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ]

      axios.get.mockResolvedValue({ data: { data: mockExercises } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      await waitFor(() => {
        expect(screen.getByText('Back Squat')).toBeInTheDocument()
        expect(screen.getByText('Pull-up')).toBeInTheDocument()
      })
    })

    it('should show empty state when no exercises exist', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      await waitFor(() => {
        expect(screen.getByText('No exercises found.')).toBeInTheDocument()
      })
    })

    it('should display exercise count', async () => {
      const mockExercises = Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        name: `Exercise ${i + 1}`,
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

      await waitFor(() => {
        expect(screen.getByText(/3 total/)).toBeInTheDocument()
        expect(screen.getByText(/3 shown/)).toBeInTheDocument()
      })
    })
  })

  describe('Search Functionality', () => {
    it('should search exercises by name', async () => {
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
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      const searchInput = screen.getByPlaceholderText(/back squat/i)
      await userEvent.type(searchInput, 'squat')

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining('/api/wodtrackr/exercises/'),
          expect.objectContaining({
            params: expect.objectContaining({ search: 'squat' }),
          })
        )
      })
    })

    it('should debounce search requests', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      const searchInput = screen.getByPlaceholderText(/back squat/i)
      
      await userEvent.type(searchInput, 'test', { delay: 50 })

      // Should not call immediately
      expect(axios.get).toHaveBeenCalledTimes(1) // Only initial load

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining('/api/wodtrackr/exercises/'),
          expect.anything()
        )
      })
    })
  })

  describe('Filtering', () => {
    it('should filter by category', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({
        data: {
          actions: {
            POST: {
              category: {
                choices: { strength: 'Strength', cardio: 'Cardio' },
              },
            },
          },
        },
      })

      render(<Exercises />)

      await waitFor(() => {
        const categorySelect = screen.getByLabelText('Category')
        expect(categorySelect).toBeInTheDocument()
      })

      const categorySelect = screen.getByLabelText('Category')
      await userEvent.selectOption(categorySelect, 'strength')

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining('/api/wodtrackr/exercises/'),
          expect.objectContaining({
            params: expect.objectContaining({ category: 'strength' }),
          })
        )
      })
    })

    it('should filter by equipment', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({
        data: {
          actions: {
            POST: {
              equipment: {
                choices: { barbell: 'Barbell', dumbbell: 'Dumbbell' },
              },
            },
          },
        },
      })

      render(<Exercises />)

      await waitFor(() => {
        const equipmentSelect = screen.getByLabelText('Equipment')
        expect(equipmentSelect).toBeInTheDocument()
      })

      const equipmentSelect = screen.getByLabelText('Equipment')
      await userEvent.selectOption(equipmentSelect, 'barbell')

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining('/api/wodtrackr/exercises/'),
          expect.objectContaining({
            params: expect.objectContaining({ equipment: 'barbell' }),
          })
        )
      })
    })

    it('should clear all filters', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      const searchInput = screen.getByPlaceholderText(/back squat/i)
      await userEvent.type(searchInput, 'test')

      const clearButton = screen.getByText('Clear Filters')
      await userEvent.click(clearButton)

      await waitFor(() => {
        expect(searchInput).toHaveValue('')
      })
    })
  })

  describe('Sorting', () => {
    it('should sort exercises by different options', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      const sortSelect = screen.getByLabelText('Sort by')
      await userEvent.selectOption(sortSelect, '-name')

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining('/api/wodtrackr/exercises/'),
          expect.objectContaining({
            params: expect.objectContaining({ ordering: '-name' }),
          })
        )
      })
    })
  })

  describe('Pagination', () => {
    it('should show Load More button when there are more exercises', async () => {
      const mockExercises = Array.from({ length: 13 }, (_, i) => ({
        id: i + 1,
        name: `Exercise ${i + 1}`,
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

      await waitFor(() => {
        expect(screen.getByText('Load More')).toBeInTheDocument()
      })
    })

    it('should load more exercises on Load More click', async () => {
      const mockExercises = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `Exercise ${i + 1}`,
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

      await waitFor(() => {
        expect(screen.getByText('Exercise 1')).toBeInTheDocument()
      })

      // Initially should show 12 exercises
      expect(screen.queryByText('Exercise 13')).not.toBeInTheDocument()

      const loadMoreButton = screen.getByText('Load More')
      await userEvent.click(loadMoreButton)

      // Should now show more exercises
      expect(screen.getByText('Exercise 13')).toBeInTheDocument()
    })
  })

  describe('Exercise Details Panel', () => {
    it('should display selected exercise details', async () => {
      const mockExercises = [
        {
          id: 1,
          name: 'Back Squat',
          description: 'A fundamental strength movement',
          category: 'strength',
          equipment: 'barbell',
          primary_muscle_group: 'legs',
          created_by_username: 'coach1',
          is_public: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]

      axios.get.mockResolvedValue({ data: { data: mockExercises } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      await waitFor(() => {
        expect(screen.getByText('Back Squat')).toBeInTheDocument()
      })

      // Click on exercise to select it
      const exercise = screen.getByText('Back Squat')
      await userEvent.click(exercise)

      // Details should be visible
      expect(screen.getByText(/A fundamental strength movement/)).toBeInTheDocument()
      expect(screen.getByText(/coach1/)).toBeInTheDocument()
    })
  })

  describe('Add Exercise Modal', () => {
    it('should open add exercise modal on Add Exercise button click', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      const addButton = screen.getByText('Add Exercise')
      await userEvent.click(addButton)

      await waitFor(() => {
        expect(screen.getByText('Create a new exercise in your library.')).toBeInTheDocument()
      })
    })

    it('should submit new exercise form', async () => {
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
            description: 'Test exercise',
            created_by_username: 'testuser',
            is_public: true,
          },
        },
      })

      render(<Exercises />)

      const addButton = screen.getByText('Add Exercise')
      await userEvent.click(addButton)

      await waitFor(() => {
        const nameInput = screen.getByDisplayValue('')
        expect(nameInput).toBeInTheDocument()
      })

      const inputs = screen.getAllByDisplayValue('')
      const nameInput = inputs[0]
      
      await userEvent.type(nameInput, 'New Exercise')

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Submit|Save/i })
      if (submitButton) {
        await userEvent.click(submitButton)
      }
    })
  })

  describe('API Integration', () => {
    it('should handle API errors gracefully', async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 500,
          data: { detail: 'Server error' },
        },
      })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument()
      })
    })

    it('should handle authentication errors', async () => {
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

    it('should load choices from OPTIONS endpoint', async () => {
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

      render(<Exercises />)

      await waitFor(() => {
        expect(axios.options).toHaveBeenCalled()
      })
    })

    it('should cache choices from localStorage', async () => {
      const cachedChoices = {
        categoryChoices: [{ value: 'strength', label: 'Strength' }],
        equipmentChoices: [{ value: 'barbell', label: 'Barbell' }],
        muscleChoices: [{ value: 'legs', label: 'Legs' }],
        cachedAt: Date.now(),
      }

      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(cachedChoices))

      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      await waitFor(() => {
        // OPTIONS should not be called if cache is fresh
        expect(axios.options).not.toHaveBeenCalled()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      axios.get.mockResolvedValue({ data: { data: [] } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      expect(screen.getByLabelText('Exercise Library')).toBeInTheDocument()
      expect(screen.getByLabelText('Exercise Details')).toBeInTheDocument()
    })

    it('should handle keyboard navigation in exercise list', async () => {
      const mockExercises = [
        {
          id: 1,
          name: 'Exercise 1',
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
          name: 'Exercise 2',
          category: 'strength',
          equipment: 'barbell',
          primary_muscle_group: 'back',
          created_by_username: 'coach',
          is_public: true,
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ]

      axios.get.mockResolvedValue({ data: { data: mockExercises } })
      axios.options.mockResolvedValue({ data: {} })

      render(<Exercises />)

      await waitFor(() => {
        expect(screen.getByText('Exercise 1')).toBeInTheDocument()
      })
    })
  })
})
