import "../CSS/exercises.css"
import axios from "axios"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { validateExerciseForm } from "../utils/exerciseUtils"
import FilterIcon from "../assets/filter.png"
import MultiSelect from "./MultiSelect"

const API_URL = "/api/wodtrackr/exercises/"
const EXERCISES_API_URL = "/api/wodtrackr/exercises/"
const CUSTOM_EXERCISES_API_URL = "/api/wodtrackr/custom-exercises/"
const PAGE_SIZE = 4
const SKELETON_CARD_COUNT = 6
const buildApiUrl = (path = "") => `${API_URL}${String(path).replace(/^\/+/, "")}`
const hasMetadataPayload = (value) => Boolean(value && typeof value === "object" && Object.keys(value).length > 0)
const EMPTY_EXERCISE_FORM_VALUES = {
  name: "",
  description: "",
  category: "",
  equipment: "",
  primary_muscle_group: "",
  created_by: "",
  is_public: false,
}


const getDefaultExerciseFormValues = (username = "") => ({
  ...EMPTY_EXERCISE_FORM_VALUES,
  created_by: username || "",
})



const getStoredUsername = () => {
  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    const userData = rawValue ? JSON.parse(rawValue) : null
    return userData?.username || ""
  } catch {
    return ""
  }
}
const getAuthToken = () => {
  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    const userData = rawValue ? JSON.parse(rawValue) : null
    return userData?.authToken || ""
  } catch {
    return ""
  }
}

const buildRequestConfig = (overrides = {}) => {
  const authToken = getAuthToken()
  return {
    ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
    ...overrides,
  }
}

const normalizeChoices = (choices) => {
  if (choices && typeof choices === "object" && !Array.isArray(choices)) {
    choices[Object.keys(choices)[0]].map((choice) => {
      return choice
    })
  }
}

const normalizeSchemaChoices = (fieldConfig) => {
  if (!fieldConfig || typeof fieldConfig !== "object") {
    return []
  }

  const enumValues = Array.isArray(fieldConfig.enum)
    ? fieldConfig.enum
    : Array.isArray(fieldConfig.child?.enum)
      ? fieldConfig.child.enum
      : null

  if (enumValues?.length) {
    const enumLabels =
      fieldConfig["x-enumNames"] ??
      fieldConfig.enumNames ??
      fieldConfig.child?.["x-enumNames"] ??
      fieldConfig.child?.enumNames ??
      []

    return enumValues
      .map((value, index) => ({
        value,
        label: String(enumLabels[index] ?? value),
      }))
      .filter((choice) => choice.value !== "" && choice.value !== null && choice.value !== undefined)
  }

  const variantChoices = normalizeChoices(fieldConfig.oneOf ?? fieldConfig.anyOf ?? fieldConfig.child?.oneOf ?? fieldConfig.child?.anyOf)
  if (variantChoices.length > 0) {
    return variantChoices
  }

  return []
}

const extractChoicesFromFieldConfig = (fieldConfig) => {
  if (!fieldConfig) {
    return []
  }

  const directChoices = normalizeChoices(fieldConfig?.choices)
  if (directChoices.length > 0) {
    return directChoices
  }

  const childChoices = normalizeChoices(fieldConfig?.child?.choices)
  if (childChoices.length > 0) {
    return childChoices
  }

  const schemaChoices = normalizeSchemaChoices(fieldConfig)
  if (schemaChoices.length > 0) {
    return schemaChoices
  }

  return []
}

const getChoicesFromMetadata = (metadata, fieldNames) => {
  if (!metadata || typeof metadata !== "object") {
    return []
  }

  const visited = new Set()
  const queue = [metadata]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== "object") {
      continue
    }

    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    for (const fieldName of fieldNames) {
      const candidate = current?.[fieldName]

      if (Array.isArray(candidate)) {
        const mapped = normalizeChoices(candidate)
        if (mapped.length > 0) {
          return mapped
        }
      }

      const mapped = extractChoicesFromFieldConfig(candidate)
      if (mapped.length > 0) {
        return mapped
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value)
      }
    }
  }

  return []
}

const formatTimestamp = (value) => {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

const getFieldErrorsFromResponse = (data) => {
  if (!data || typeof data !== "object") {
    return {}
  }

  const possibleFields = ["name", "description", "category", "equipment", "primary_muscle_group", "created_by", "is_public"]
  return possibleFields.reduce((accumulator, fieldName) => {
    const rawValue = data[fieldName]
    if (!rawValue) {
      return accumulator
    }

    accumulator[fieldName] = Array.isArray(rawValue) ? rawValue.join(" ") : String(rawValue)
    return accumulator
  }, {})
}

const getExerciseFormValues = (exercise) => ({
  name: exercise?.name || "",
  description: exercise?.description || "",
  category: exercise?.category || "",
  equipment: exercise?.equipment || "",
  primary_muscle_group: exercise?.primary_muscle_group || "",
  created_by: exercise?.created_by_username || exercise?.username || exercise?.created_by || "",
  is_public: Boolean(exercise?.is_public),
})


function Exercises({ isChoicesLoading, categoryChoices, equipmentChoices, muscleChoices, exerciseLibraryState, setExerciseLibraryState, handleSearchChange, handleSortChange, handleClearFilters, searchName, setSearchName, sortOrder, setSortOrder, filters, setFilters, setIsChoicesLoading })
{
  const [selectedExerciseId, setSelectedExerciseId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(true)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editErrorMessage, setEditErrorMessage] = useState("")
  const [editFieldErrors, setEditFieldErrors] = useState({})
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false)
  const [formValues, setFormValues] = useState(() => getDefaultExerciseFormValues(getStoredUsername()))
  const [editFormValues, setEditFormValues] = useState(EMPTY_EXERCISE_FORM_VALUES)
  const [exercisesErrorMessage, setExercisesErrorMessage] = useState("")

  // Refs for modal focus management
  const addModalRef = useRef(null)
  const editModalRef = useRef(null)
  const addModalTriggerRef = useRef(null)
  const editModalTriggerRef = useRef(null)
  const addModalPreviouslyOpen = useRef(false)
  const editModalPreviouslyOpen = useRef(false)

  const { exerciseLibrary, 
    isExerciseLibraryLoading, 
    exerciseLibraryError } = exerciseLibraryState

  useEffect(() => {
    if (!successMessage) {
      return undefined
    }

    const timer = setTimeout(() => {
      setSuccessMessage("")
    }, 3000)

    return () => clearTimeout(timer)
  }, [successMessage])

  const filteredAndSortedLibrary = useMemo(() => {
    const library = exerciseLibraryState.exerciseLibrary || []
    let result = [...library]
    try {
      if (searchName.trim()) {
        const query = searchName.trim().toLowerCase()
        result = result.filter(
          (p) =>
            String(p?.name || "").toLowerCase().includes(query) ||
            String(p?.description || "").toLowerCase().includes(query),
        )
      }

      if (difficulty.length > 0) {
        result = result.filter((p) => difficulty.includes(p.difficulty))
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }
    
      if (Array.isArray(category) && category.length > 0) {
        result = result.filter((p) => category.includes(p.category))
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }
      if (Array.isArray(goal) && goal.length > 0) {
        result = result.filter((p) => goal.includes(p.goal))
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }
      if (Array.isArray(equipment) && equipment.length > 0) {
        result = result.filter((p) => {
          const programEquipment = getProgramEquipmentValues(p)
          return equipment.some((selectedValue) => programEquipment.includes(normalizeEquipmentEntry(selectedValue)))
        })
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }
      if (Array.isArray(muscle) && muscle.length > 0) {
        result = result.filter((p) => {
          const programMuscles = getProgramMuscleValues(p)
          return muscle.some((selectedValue) => programMuscles.includes(normalizeMuscleEntry(selectedValue)))
        })
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }

      result.sort((a, b) => {
        const cmp = String(a?.name || "").localeCompare(String(b?.name || ""))
        return sortOrder === "asc" ? cmp : -cmp
      })

      return result
    } catch (error) {
      console.error('Error filtering and sorting library:', error)
      return []
    }
  }, [exerciseLibraryState, searchName, sortOrder, filters])

  const normalizeExercisesPayload = (data) => {
    if (Array.isArray(data?.data)) return data.data
    if (Array.isArray(data?.results)) return data.results
    if (Array.isArray(data)) return data
    return []
  }


  const handleAddChange = (event) => {
    const { name, value, type, checked } = event.target
    setFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleEditChange = (event) => {
    const { name, value, type, checked } = event.target
    setEditFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
    if (editFieldErrors[name]) {
      setEditFieldErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage("")
    setSuccessMessage("")

    const clientErrors = validateExerciseForm(formValues)
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors)
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(true)
    setFieldErrors({})

    try {
      const response = await axios.post(
        API_URL,
        {
          name: formValues.name,
          description: formValues.description,
          category: formValues.category,
          equipment: formValues.equipment,
          primary_muscle_group: formValues.primary_muscle_group,
          created_by: currentUsername || formValues.created_by,
          is_public: formValues.is_public,
        },
        buildRequestConfig(),
      )

      if (response?.data?.data) {
        setExercises((prev) => [response.data.data, ...prev])
      }

      setFormValues(getDefaultExerciseFormValues(currentUsername))
      setSuccessMessage("Exercise added successfully.")
    } catch (error) {
      const extractedFieldErrors = getFieldErrorsFromResponse(error?.response?.data)
      if (Object.keys(extractedFieldErrors).length > 0) {
        setFieldErrors(extractedFieldErrors)
      }

      if (error?.response?.status === 401 || error?.response?.status === 403) {
        setErrorMessage("Please log in before adding exercises.")
        return
      }
      const message =
        error?.response?.data?.detail ||
        "Unable to save exercise. Please check your inputs."
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenAddModal = () => {
    setIsAddModalOpen(true)
  }

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false)
  }

  const handleAddExercise = () => {
    setErrorMessage("")
    setFieldErrors({})
    setSuccessMessage("")
    setFormValues(getDefaultExerciseFormValues(currentUsername))
    setIsAddModalOpen(true)
  }

  const handleOpenEditModal = () => {
    if (!canEditSelectedExercise) {
      return
    }

    setEditErrorMessage("")
    setEditFieldErrors({})
    setEditFormValues(getExerciseFormValues(selectedExercise))
    setIsEditModalOpen(true)
  }

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false)
  }

  const handleCloseLibraryModal = () => {
    setIsLibraryModalOpen(false)
    setIsDetailsModalOpen(false)
  }

  const handleOpenLibraryModal = () => {
    setIsLibraryModalOpen(true)
  }

  const handleCloseExerciseDetailsModal = () => {
    setIsDetailsModalOpen(false)
  }

  const handleEditSubmit = async (event) => {
    event.preventDefault()
    if (!selectedExercise?.id) {
      return
    }

    setEditErrorMessage("")

    const clientErrors = validateExerciseForm(editFormValues)
    if (Object.keys(clientErrors).length > 0) {
      setEditFieldErrors(clientErrors)
      setIsEditSubmitting(false)
      return
    }

    setIsEditSubmitting(true)
    setEditFieldErrors({})

    try {
      const response = await axios.patch(
        `${API_URL}${selectedExercise.id}/`,
        {
          name: editFormValues.name,
          description: editFormValues.description,
          category: editFormValues.category,
          equipment: editFormValues.equipment,
          primary_muscle_group: editFormValues.primary_muscle_group,
          created_by: editFormValues.created_by,
          is_public: editFormValues.is_public,
        },
        buildRequestConfig(),
      )

      const updatedExercise = response?.data?.data ?? response?.data
      if (updatedExercise) {
        setExercises((prev) =>
          prev.map((exercise) =>
            exercise.id === updatedExercise.id ? updatedExercise : exercise,
          ),
        )
      }

      setSuccessMessage("Exercise updated successfully.")
      setIsEditModalOpen(false)
    } catch (error) {
      const extractedFieldErrors = getFieldErrorsFromResponse(error?.response?.data)
      if (Object.keys(extractedFieldErrors).length > 0) {
        setEditFieldErrors(extractedFieldErrors)
      }

      if (error?.response?.status === 401 || error?.response?.status === 403) {
        setEditErrorMessage("Please log in before editing exercises.")
        return
      }

      const message =
        error?.response?.data?.detail ||
        "Unable to update exercise. Please check your inputs."
      setEditErrorMessage(message)
    } finally {
      setIsEditSubmitting(false)
    }
  }

  const handleDeleteExercise = async () => {
    if (!selectedExercise?.id || !canDeleteSelectedExercise) {
      return
    }

    setErrorMessage("")
    setSuccessMessage("")
    setIsDeleteSubmitting(true)

    try {
      await axios.delete(`${API_URL}${selectedExercise.id}/`, buildRequestConfig())
      setExercises((prev) => prev.filter((exercise) => exercise.id !== selectedExercise.id))
      setSuccessMessage("Exercise deleted successfully.")
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        setErrorMessage("Please log in before deleting exercises.")
        return
      }

      const message =
        error?.response?.data?.detail ||
        "Unable to delete exercise. Please try again."
      setErrorMessage(message)
    } finally {
      setIsDeleteSubmitting(false)
    }
  }

  const handleOpenExerciseDetailsModal = (exerciseId) => {
    setSelectedExerciseId(exerciseId)
    setIsDetailsModalOpen(true)
  }

  const selectedExercise = exerciseLibrary.find((exercise) => (exercise.id ?? null) === selectedExerciseId) || null
  const currentUsername = getStoredUsername()
  const selectedExerciseOwner =
    selectedExercise?.created_by_username ||
    selectedExercise?.username ||
    selectedExercise?.created_by ||
    ""
  const canEditSelectedExercise = Boolean(
    selectedExercise &&
    currentUsername &&
    selectedExerciseOwner &&
    currentUsername === selectedExerciseOwner,
  )
  const canDeleteSelectedExercise = canEditSelectedExercise

  useEffect(() => {
    const loadExerciseLibrary = async () => {
      const config = buildRequestConfig()
      setExerciseLibraryState((prevState) => ({
        ...prevState,
        isExerciseLibraryLoading: true,
        exerciseLibraryError: '',
      }))
      console.log('Loading exercise library...')
      try {
        console.log("config:", config)
        const response = await axios.get(EXERCISES_API_URL, config)
        console.log('Exercise library loaded:', response?.data.all_exercises || response?.data || [])
        const nextNode = response?.data?.next
        setExerciseLibraryState((prevState) => ({
          ...prevState,
          isExerciseLibraryLoading: false,
          exerciseLibraryError: '',
          exerciseLibrary: normalizeExercisesPayload(response?.data.all_exercises || response?.data || [] ),
          hasMoreExercises: nextNode !== null,
        }))
      } catch (error) {
        console.error('API or Normalization Error:', error?.response || error?.message || error)
        setExerciseLibraryState((prevState) => ({
          ...prevState,
          isExerciseLibraryLoading: false,
          exerciseLibrary: [],
          exerciseLibraryError: 'Unable to load exercise library for workout planning.',
        }))
      }
    }
    loadExerciseLibrary()
  }, [searchName, sortOrder, filters])

  useEffect(() => {
    if (exerciseLibrary.length === 0) {
      setSelectedExerciseId(null)
      return
    }

    const hasSelectedExercise = exerciseLibrary.some((exercise) => (exercise.id ?? null) === selectedExerciseId)
    if (!hasSelectedExercise) {
      const fallbackId = exerciseLibrary[0]?.id ?? null
      setSelectedExerciseId(fallbackId)
    }
  }, [exerciseLibrary, selectedExerciseId])

  return (
    <main className="exercise-page" aria-label="Exercise Library">
      <section className="exercise-library-panel">
          <header className="exercise-panel-header">
            <div className="exercise-panel-header-top">
                <h1>Exercise Library</h1>
                <button className="exercise-primary-btn" type="submit" disabled={isAddModalOpen} onClick={handleAddExercise}>
                  Add Exercise
                </button>
            </div>
                <p>Browse and manage exercises in the library. Use the search and filter options to find specific exercises.</p>
          </header>
          <div className="exercise-counts" aria-live="polite" aria-atomic="true">
            <span>{exerciseLibrary.length} total</span>
            <span>{exerciseLibrary.length} shown</span>
          </div>
          {isExerciseLibraryLoading ? (
            <p className="exercise-loading-note" role="status">Still loading exercises. Thanks for hanging tight.</p>
          ) : null}
          {exercisesErrorMessage ? <p className="exercise-error" role="alert">{exercisesErrorMessage}</p> : null}
          {successMessage ? <p className="exercise-success" role="status">{successMessage}</p> : null}

          <div
            className="exercise-list"
            role={!isExerciseLibraryLoading && exerciseLibrary.length > 0 ? "listbox" : undefined}
            aria-label={!isExerciseLibraryLoading && exerciseLibrary.length > 0 ? "Exercises" : undefined}
            aria-busy={isExerciseLibraryLoading}
          >
            {console.log("isExerciseLibraryLoading:", isExerciseLibraryLoading, "exerciseLibrary.length:", exerciseLibrary.length)}
            {isExerciseLibraryLoading ? (
              Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
                <div className="exercise-item exercise-item-skeleton" key={`exercise-skeleton-${index}`} aria-hidden="true">
                  <div className="exercise-skeleton exercise-skeleton-title" />
                  <div className="exercise-skeleton exercise-skeleton-line" />
                  <div className="exercise-skeleton exercise-skeleton-line exercise-skeleton-line-short" />
                  <div className="exercise-skeleton exercise-skeleton-line" />
                </div>
              ))
            ) : exerciseLibrary.length === 0 ? (
              <p className="exercise-empty" role="status">No exercises found.</p>
            ) : (
              exerciseLibrary.map((exercise, index) => (
                <article
                  className={`exercise-item ${(exercise.id ?? null) === selectedExerciseId ? "exercise-item-selected" : ""}`}
                  key={exercise.id ?? index}
                  id={exercise.id ? `exercise-option-${exercise.id}` : undefined}
                  role="option"
                  aria-selected={(exercise.id ?? null) === selectedExerciseId}
                  tabIndex={(exercise.id ?? null) === selectedExerciseId ? 0 : -1}
                  onClick={() => handleOpenExerciseDetailsModal(exercise.id ?? null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      handleOpenExerciseDetailsModal(exercise.id ?? null)
                    }
                  }}
                >
                  <div className="exercise-header">
                    <h3>{exercise.name}</h3>
                    <span>{exercise.category}</span>
                  </div>
                  <p className="exercise-meta">
                    {exercise.equipment} · {exercise.primary_muscle_group}
                  </p>
                  <p className="exercise-meta">
                    Created by {exercise.created_by_username || exercise.username || exercise.created_by || "Unknown"} · {exercise.is_public ? "Public" : "Private"}
                  </p>
                  <p className="exercise-meta">
                    Created {formatTimestamp(exercise.created_at)} · Updated {formatTimestamp(exercise.updated_at)}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
        <section className="exercise-form-panel">
          <div className="exercise-search-header">
            <h2>Search & Filter</h2>
            <p>Filter the exercise library by name, category, equipment, or muscle group.</p>
          </div>
          <div className="exercise-search-grid">
            <label className="exercise-field exercise-field-wide">
              <span>Search by name</span>
              <input
                type="text"
                name="name"
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
                placeholder="Back squat, pull-up, row"
              />
            </label>

            <label className="exercise-field">
              <span>Category</span>
              {console.log(filters.category)}
              <MultiSelect
                            options={categoryChoices}
                            value={filters.category || []}
                            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                            name="category"
              />
            </label>

            <label className="exercise-field">
              <span>Equipment</span>
              {console.log(filters.equipment)}
              <MultiSelect
                            options={equipmentChoices}
                            value={filters.equipment || []}
                            onChange={(e) => setFilters({ ...filters, equipment: e.target.value })}
                            name="equipment"
              />
            </label>

            <label className="exercise-field">
              <span>Muscle</span>
              <MultiSelect
                            options={muscleChoices}
                            value={filters.muscle || []}
                            onChange={(e) => setFilters({ ...filters, muscle: e.target.value })}
                            name="muscle"
              />
            </label>

            <label className="exercise-field exercise-field-wide">
              <span>Sort by</span>
              <select
                name="ordering"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                <option value="name">Name (A-Z)</option>
                <option value="-name">Name (Z-A)</option>
                <option value="created_at">Created (oldest)</option>
                <option value="-created_at">Created (newest)</option>
                <option value="updated_at">Updated (oldest)</option>
                <option value="-updated_at">Updated (newest)</option>
              </select>
            </label>
          </div>

          <div className="exercise-search-actions">
            <button type="button" className="exercise-secondary-btn" onClick={handleClearFilters}>
              Clear Filters
            </button>
          </div>
        </section>
        {isAddModalOpen ? (
          <div className="exercise-modal-backdrop" onClick={handleOpenAddModal}>
            <aside className="exercise-modal" role="dialog" aria-modal="true" aria-labelledby="exercise-modal-title" aria-describedby="exercise-modal-desc" ref={addModalRef}>
              {/* TODO: Change Add Exercise to be modal. */}
              <header className="exercise-modal-header">
                <div>
                  <h2 id="exercise-modal-title">Add Exercise</h2>
                  <p id="exercise-modal-desc">Create a new exercise in your library.</p>
                </div>
              </header>

              <form className="exercise-form" onSubmit={handleSubmit} noValidate>
                {errorMessage ? <p className="exercise-error" role="alert">{errorMessage}</p> : null}

                <label className="exercise-field">
                  <span>Name</span>
                  <input
                    type="text"
                    name="name"
                    value={formValues.name}
                    onChange={handleAddChange}
                    placeholder="Exercise name"
                    maxLength={200}
                    required
                  />
                  {fieldErrors.name ? <small className="exercise-field-error">{fieldErrors.name}</small> : null}
                </label>

                <label className="exercise-field">
                  <span>Description</span>
                  <input
                    type="text"
                    name="description"
                    value={formValues.description}
                    onChange={handleAddChange}
                    placeholder="Optional details"
                  />
                  {fieldErrors.description ? <small className="exercise-field-error">{fieldErrors.description}</small> : null}
                </label>

                <label className="exercise-field">
                  <span>Category</span>
                  <input
                    type="text"
                    name="category"
                    value={formValues.category}
                    onChange={handleAddChange}
                    placeholder="Exercise category"
                    maxLength={100}
                    required
                  />
                  {fieldErrors.category ? <small className="exercise-field-error">{fieldErrors.category}</small> : null}
                </label>

                <div className="exercise-form-actions">
                  <button type="submit" className="exercise-primary-btn">Add Exercise</button>
                  <button type="button" className="exercise-secondary-btn" onClick={handleCloseAddModal}>Cancel</button>
                </div>
              </form>
            </aside>
          </div>
        ) : null}

        {isDetailsModalOpen && selectedExercise ? (
          <div className="exercise-backdrop" role="presentation" onClick={handleCloseExerciseDetailsModal}>
            <aside
              className="exercise-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="exercise-details-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="exercise-modal-header">
                <div>
                  <h2 id="exercise-details-modal-title">Exercise Details</h2>
                  <p>Select an exercise from the library to review details.</p>
                </div>
                <div className="exercise-header-actions">
                  {canEditSelectedExercise ? (
                    <button
                      type="button"
                      className="exercise-secondary-btn"
                      onClick={handleOpenEditModal}
                      ref={editModalTriggerRef}
                    >
                      Edit Exercise
                    </button>
                  ) : null}
                  <button type="button" className="exercise-secondary-btn" onClick={handleCloseExerciseDetailsModal}>
                    Close
                  </button>
                </div>
              </header>
            </aside>
            <section className="exercise-details" aria-live="polite">
              <h3>{selectedExercise.name}</h3>
              <p className="exercise-meta">
                <strong>Category:</strong> {categoryLookup[selectedExercise.category] || selectedExercise.category || "N/A"}
              </p>
              <p className="exercise-meta">
                <strong>Equipment:</strong> {equipmentLookup[selectedExercise.equipment] || selectedExercise.equipment || "N/A"}
              </p>
              <p className="exercise-meta">
                <strong>Muscle:</strong> {selectedExercise.primary_muscle_group || "N/A"}
              </p>
              <p className="exercise-meta">
                <strong>Description:</strong> {selectedExercise.description || "No description provided."}
              </p>
              <p className="exercise-meta">
                <strong>Created by:</strong> {selectedExercise.created_by_username || selectedExercise.username || selectedExercise.created_by || "Unknown"}
              </p>
              <p className="exercise-meta">
                <strong>Visibility:</strong> {selectedExercise.is_public ? "Public" : "Private"}
              </p>
              <p className="exercise-meta">
                <strong>Created:</strong> {formatTimestamp(selectedExercise.created_at)}
              </p>
              <p className="exercise-meta">
                <strong>Updated:</strong> {formatTimestamp(selectedExercise.updated_at)}
              </p>
              {canDeleteSelectedExercise ? (
                <button
                  type="button"
                  className="exercise-danger-btn"
                  onClick={handleDeleteExercise}
                  disabled={isDeleteSubmitting}
                >
                  {isDeleteSubmitting ? "Deleting..." : "Delete Exercise"}
                </button>
              ) : null}
            </section>
          </div>
        ) : null}
        {isEditModalOpen ? (
          <div
            className="exercise-modal-backdrop"
            role="presentation"
            onClick={handleCloseEditModal}
          >
            <aside
              className="exercise-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="exercise-edit-modal-title"
              aria-describedby="exercise-edit-modal-desc"
              ref={editModalRef}
              onKeyDown={handleEditModalKeyDown}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="exercise-modal-header">
                <div>
                  <h2 id="exercise-edit-modal-title">Edit Exercise</h2>
                  <p id="exercise-edit-modal-desc">Update the selected exercise in your library.</p>
                </div>
                <button
                  type="button"
                  className="exercise-secondary-btn"
                  aria-label="Close Edit Exercise dialog"
                  onClick={handleCloseEditModal}
                >
                  Close
                </button>
              </header>

              <form className="exercise-form" onSubmit={handleEditSubmit} noValidate>
                {editErrorMessage ? <p className="exercise-error" role="alert">{editErrorMessage}</p> : null}

                <label className="exercise-field">
                  <span>Name</span>
                  <input
                    type="text"
                    name="name"
                    value={editFormValues.name}
                    onChange={handleEditChange}
                    placeholder="Exercise name"
                    maxLength={200}
                    required
                  />
                  {editFieldErrors.name ? <small className="exercise-field-error">{editFieldErrors.name}</small> : null}
                </label>

                <label className="exercise-field">
                  <span>Description</span>
                  <input
                    type="text"
                    name="description"
                    value={editFormValues.description}
                    onChange={handleEditChange}
                    placeholder="Optional details"
                  />
                  {editFieldErrors.description ? <small className="exercise-field-error">{editFieldErrors.description}</small> : null}
                </label>

                <label className="exercise-field">
                  <span>Category</span>
                  <select
                    name="category"
                    value={editFormValues.category}
                    onChange={handleEditChange}
                    disabled={isChoicesLoading}
                    required
                  >
                    <option value="">{isChoicesLoading ? "Loading categories..." : "Select category"}</option>
                    {categoryChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                  {editFieldErrors.category ? <small className="exercise-field-error">{editFieldErrors.category}</small> : null}
                </label>

                <label className="exercise-field">
                  <span>Equipment</span>
                  <select
                    name="equipment"
                    value={editFormValues.equipment}
                    onChange={handleEditChange}
                    disabled={isChoicesLoading}
                    required
                  >
                    <option value="">{isChoicesLoading ? "Loading equipment..." : "Select equipment"}</option>
                    {equipmentChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                  {editFieldErrors.equipment ? <small className="exercise-field-error">{editFieldErrors.equipment}</small> : null}
                </label>

                <label className="exercise-field">
                  <span>Created by</span>
                  <input
                    type="text"
                    name="created_by"
                    value={editFormValues.created_by}
                    onChange={handleEditChange}
                    placeholder="Coach or athlete"
                  />
                  {editFieldErrors.created_by ? <small className="exercise-field-error">{editFieldErrors.created_by}</small> : null}
                </label>

                <label className="exercise-field">
                  <span>Muscle</span>
                  <select
                    name="primary_muscle_group"
                    value={editFormValues.primary_muscle_group}
                    onChange={handleEditChange}
                    disabled={isChoicesLoading}
                    required
                  >
                    <option value="">{isChoicesLoading ? "Loading muscle groups..." : "Select muscle group"}</option>
                    {muscleChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                  {editFieldErrors.primary_muscle_group ? <small className="exercise-field-error">{editFieldErrors.primary_muscle_group}</small> : null}
                </label>

                <label className="exercise-checkbox">
                  <input
                    type="checkbox"
                    name="is_public"
                    checked={editFormValues.is_public}
                    onChange={handleEditChange}
                  />
                  Public exercise
                </label>
                {editFieldErrors.is_public ? <small className="exercise-field-error">{editFieldErrors.is_public}</small> : null}

                <button className="exercise-primary-btn" type="submit" disabled={isEditSubmitting}>
                  {isEditSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </form>
            </aside>
          </div>
        ) : null}
    </main>
  )
}

export default Exercises
