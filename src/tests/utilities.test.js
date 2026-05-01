import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  normalizeChoices,
  extractChoicesFromFieldConfig,
  getChoicesFromMetadata,
  formatTimestamp,
  getFieldErrorsFromResponse,
  getExerciseFormValues,
} from '../utils/exerciseUtils'

describe('Exercise Utility Functions', () => {
  describe('normalizeChoices', () => {
    it('should normalize object choices to array format', () => {
      const choices = { strength: 'Strength', cardio: 'Cardio' }
      const result = normalizeChoices(choices)
      expect(result).toEqual([
        { value: 'strength', label: 'Strength' },
        { value: 'cardio', label: 'Cardio' },
      ])
    })

    it('should normalize array of tuples', () => {
      const choices = [['strength', 'Strength'], ['cardio', 'Cardio']]
      const result = normalizeChoices(choices)
      expect(result).toEqual([
        { value: 'strength', label: 'Strength' },
        { value: 'cardio', label: 'Cardio' },
      ])
    })

    it('should normalize array of objects', () => {
      const choices = [
        { value: 'strength', label: 'Strength' },
        { value: 'cardio', label: 'Cardio' },
      ]
      const result = normalizeChoices(choices)
      expect(result).toEqual(choices)
    })

    it('should handle alternative object properties', () => {
      const choices = [
        { id: 'strength', display_name: 'Strength' },
        { id: 'cardio', display_name: 'Cardio' },
      ]
      const result = normalizeChoices(choices)
      expect(result).toEqual([
        { value: 'strength', label: 'Strength' },
        { value: 'cardio', label: 'Cardio' },
      ])
    })

    it('should filter out empty values', () => {
      const choices = { strength: 'Strength', '': 'Empty' }
      const result = normalizeChoices(choices)
      expect(result).toEqual([{ value: 'strength', label: 'Strength' }])
    })

    it('should return empty array for invalid input', () => {
      expect(normalizeChoices(null)).toEqual([])
      expect(normalizeChoices(undefined)).toEqual([])
      expect(normalizeChoices('invalid')).toEqual([])
    })
  })

  describe('extractChoicesFromFieldConfig', () => {
    it('should extract schema enum choices with enum labels', () => {
      const fieldConfig = {
        enum: ['strength', 'cardio'],
        'x-enumNames': ['Strength', 'Cardio'],
      }

      expect(extractChoicesFromFieldConfig(fieldConfig)).toEqual([
        { value: 'strength', label: 'Strength' },
        { value: 'cardio', label: 'Cardio' },
      ])
    })

    it('should extract child schema enum choices when nested', () => {
      const fieldConfig = {
        child: {
          enum: ['barbell'],
          enumNames: ['Barbell'],
        },
      }

      expect(extractChoicesFromFieldConfig(fieldConfig)).toEqual([
        { value: 'barbell', label: 'Barbell' },
      ])
    })
  })

  describe('getChoicesFromMetadata', () => {
    it('should find schema enum choices in OPTIONS metadata', () => {
      const metadata = {
        actions: {
          POST: {
            category: {
              type: 'choice',
              enum: ['strength', 'cardio'],
              'x-enumNames': ['Strength', 'Cardio'],
            },
          },
        },
      }

      expect(getChoicesFromMetadata(metadata, ['category'])).toEqual([
        { value: 'strength', label: 'Strength' },
        { value: 'cardio', label: 'Cardio' },
      ])
    })
  })

  describe('formatTimestamp', () => {
    it('should format valid timestamp', () => {
      const timestamp = '2024-04-29T10:30:00Z'
      const result = formatTimestamp(timestamp)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('should return empty string for falsy input', () => {
      expect(formatTimestamp(null)).toBe('')
      expect(formatTimestamp(undefined)).toBe('')
      expect(formatTimestamp('')).toBe('')
    })

    it('should return original value for invalid timestamp', () => {
      const invalidTimestamp = 'not-a-date'
      const result = formatTimestamp(invalidTimestamp)
      expect(result).toBe(invalidTimestamp)
    })
  })

  describe('getFieldErrorsFromResponse', () => {
    it('should extract field errors from response', () => {
      const data = {
        name: ['This field is required'],
        description: 'Invalid description',
      }
      const result = getFieldErrorsFromResponse(data)
      expect(result.name).toBe('This field is required')
      expect(result.description).toBe('Invalid description')
    })

    it('should handle null response', () => {
      const result = getFieldErrorsFromResponse(null)
      expect(result).toEqual({})
    })

    it('should only extract known fields', () => {
      const data = {
        name: 'Name error',
        unknown_field: 'This should not appear',
      }
      const result = getFieldErrorsFromResponse(data)
      expect(result.name).toBe('Name error')
      expect(result.unknown_field).toBeUndefined()
    })

    it('should join array errors with space', () => {
      const data = {
        category: ['Invalid choice', 'Already exists'],
      }
      const result = getFieldErrorsFromResponse(data)
      expect(result.category).toBe('Invalid choice Already exists')
    })
  })

  describe('getExerciseFormValues', () => {
    it('should extract form values from exercise object', () => {
      const exercise = {
        name: 'Back Squat',
        description: 'A fundamental strength exercise',
        category: 'strength',
        equipment: 'barbell',
        primary_muscle_group: 'legs',
        created_by_username: 'coach123',
        is_public: true,
      }
      const result = getExerciseFormValues(exercise)
      expect(result).toEqual({
        name: 'Back Squat',
        description: 'A fundamental strength exercise',
        category: 'strength',
        equipment: 'barbell',
        primary_muscle_group: 'legs',
        created_by: 'coach123',
        is_public: true,
      })
    })

    it('should use fallback username fields', () => {
      const exercise = {
        name: 'Push-up',
        created_by: 'user456',
      }
      const result = getExerciseFormValues(exercise)
      expect(result.created_by).toBe('user456')
    })

    it('should provide empty defaults for missing fields', () => {
      const result = getExerciseFormValues({})
      expect(result).toEqual({
        name: '',
        description: '',
        category: '',
        equipment: '',
        primary_muscle_group: '',
        created_by: '',
        is_public: false,
      })
    })

    it('should handle null exercise', () => {
      const result = getExerciseFormValues(null)
      expect(result).toEqual({
        name: '',
        description: '',
        category: '',
        equipment: '',
        primary_muscle_group: '',
        created_by: '',
        is_public: false,
      })
    })
  })
})
