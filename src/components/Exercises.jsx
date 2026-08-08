import "../CSS/exercises.css"
import axios from "axios"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { validateExerciseForm } from "../utils/exerciseUtils"

const API_URL = "/api/wodtrackr/exercises/"
const EQUIPMENT_API_URL = "/api/wodtrackr/equipment/"
const CHOICES_CACHE_KEY = "wodtrackrExerciseChoices"
const CHOICES_CACHE_TTL_MS = 1000 * 60 * 60 * 12
const PAGE_SIZE = 12
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
const [exerciseLibrary, setExerciseLibrary] = useState([])
const [isExerciseLibraryLoading, setIsExerciseLibraryLoading] = useState(false)
const [exerciseLibraryError, setExerciseLibraryError] = useState("")
const getDefaultExerciseFormValues = (username = "") => ({
  ...EMPTY_EXERCISE_FORM_VALUES,
  created_by: username || "",
})

const getAuthToken = () => {
  const directToken = localStorage.getItem("wodtrackrAuthToken")
  if (directToken) {
    return directToken
  }

  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    const userData = rawValue ? JSON.parse(rawValue) : null
    return userData?.authToken || ""
  } catch {
    return ""
  }
}

const getStoredUsername = () => {
  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    const userData = rawValue ? JSON.parse(rawValue) : null
    return userData?.username || ""
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
    return Object.entries(choices)
      .map(([value, label]) => ({
        value,
        label: String(label),
      }))
      .filter((choice) => choice.value !== "" && choice.value !== null && choice.value !== undefined)
  }

  if (!Array.isArray(choices)) {
    return []
  }

  return choices
    .map((choice) => {
      if (Array.isArray(choice)) {
        const [value, label] = choice
        return {
          value: value ?? "",
          label: label ?? String(value ?? ""),
        }
      }

      if (choice && typeof choice === "object") {
        const value = choice.value ?? choice.id ?? choice.key ?? ""
        const label =
          choice.label ??
          choice.display_name ??
          choice.displayName ??
          choice.name ??
          String(value)

        return {
          value,
          label,
        }
      }

      return {
        value: choice,
        label: String(choice),
      }
    })
    .filter((choice) => choice.value !== "" && choice.value !== null && choice.value !== undefined)
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

const normalizeEquipmentPayload = (data) => {
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data)) return data
  return []
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


function Exercises() {
  const [exercises, setExercises] = useState([])
  const [searchName, setSearchName] = useState("")
  const [ordering, setOrdering] = useState("name")
  const [filters, setFilters] = useState({
    category: "",
    equipment: "",
    muscle: "",
  })
  const [selectedExerciseId, setSelectedExerciseId] = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(true)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSlowLoading, setIsSlowLoading] = useState(false)
  const [isChoicesLoading, setIsChoicesLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editErrorMessage, setEditErrorMessage] = useState("")
  const [editFieldErrors, setEditFieldErrors] = useState({})
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false)
  const [categoryChoices, setCategoryChoices] = useState([])
  const [equipmentChoices, setEquipmentChoices] = useState([])
  const [muscleChoices, setMuscleChoices] = useState([])
  const [formValues, setFormValues] = useState(() => getDefaultExerciseFormValues(getStoredUsername()))
  const [editFormValues, setEditFormValues] = useState(EMPTY_EXERCISE_FORM_VALUES)

  // Refs for modal focus management
  const addModalRef = useRef(null)
  const editModalRef = useRef(null)
  const addModalTriggerRef = useRef(null)
  const editModalTriggerRef = useRef(null)
  const addModalPreviouslyOpen = useRef(false)
  const editModalPreviouslyOpen = useRef(false)

  useEffect(() => {
    if (!successMessage) {
      return undefined
    }

    const timer = setTimeout(() => {
      setSuccessMessage("")
    }, 3000)

    return () => clearTimeout(timer)
  }, [successMessage])

  useEffect(() => {
    if (!isLoading) {
      setIsSlowLoading(false)
      return undefined
    }

    const timer = setTimeout(() => {
      setIsSlowLoading(true)
    }, 1200)

    return () => clearTimeout(timer)
  }, [isLoading])

  // Move focus into the add-exercise modal when it opens, and return it when it closes
  useEffect(() => {
    if (isAddModalOpen) {
      addModalPreviouslyOpen.current = true
      addModalRef.current
        ?.querySelector("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")
        ?.focus()
    } else if (addModalPreviouslyOpen.current) {
      addModalTriggerRef.current?.focus()
    }
  }, [isAddModalOpen])

  // Move focus into the edit-exercise modal when it opens, and return it when it closes
  useEffect(() => {
    if (isEditModalOpen) {
      editModalPreviouslyOpen.current = true
      editModalRef.current
        ?.querySelector("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")
        ?.focus()
    } else if (editModalPreviouslyOpen.current) {
      editModalTriggerRef.current?.focus()
    }
  }, [isEditModalOpen])

  // Keyboard handler: Escape closes the add modal; Tab is trapped inside it
  const handleAddModalKeyDown = useCallback((event) => {
    if (event.key === "Escape") {
      setIsAddModalOpen(false)
      return
    }
    if (event.key !== "Tab" || !addModalRef.current) return
    const focusables = Array.from(
      addModalRef.current.querySelectorAll(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    )
    if (focusables.length < 2) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  // Keyboard handler: Escape closes the edit modal; Tab is trapped inside it
  const handleEditModalKeyDown = useCallback((event) => {
    if (event.key === "Escape") {
      setIsEditModalOpen(false)
      return
    }
    if (event.key !== "Tab" || !editModalRef.current) return
    const focusables = Array.from(
      editModalRef.current.querySelectorAll(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    )
    if (focusables.length < 2) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  useEffect(() => {
    const loadExercises = async () => {
      setIsLoading(true)
      setErrorMessage("")
      setSuccessMessage("")
      setVisibleCount(PAGE_SIZE)

      try {
        const response = await axios.get(API_URL, {
          ...buildRequestConfig(),
          params: {
            ...(searchName ? { search: searchName } : {}),
            ordering,
            ...(filters.category ? { category: filters.category } : {}),
            ...(filters.equipment ? { equipment: filters.equipment } : {}),
            ...(filters.muscle ? { muscle: filters.muscle } : {}),
          },
        })
        const payload = Array.isArray(response?.data?.data)
          ? response.data.data
          : []
        setExercises(payload)
      } catch (error) {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          setErrorMessage("Please log in to load exercises and categories.")
          return
        }
        const message =
          error?.response?.data?.detail ||
          "Unable to load exercises. Please try again."
        setErrorMessage(message)
      } finally {
        setIsLoading(false)
      }
    }

    const timer = setTimeout(() => {
      loadExercises()
    }, 300)

    return () => clearTimeout(timer)
  }, [filters, ordering, searchName])

  useEffect(() => {
    const loadChoices = async () => {
      setIsChoicesLoading(true)
      setErrorMessage("")

      try {
        const cachedRawValue = localStorage.getItem(CHOICES_CACHE_KEY)
        if (cachedRawValue) {
          const parsedCache = JSON.parse(cachedRawValue)
          const isCacheFresh = Date.now() - (parsedCache?.cachedAt || 0) < CHOICES_CACHE_TTL_MS

          if (isCacheFresh && parsedCache?.categoryChoices?.length && parsedCache?.equipmentChoices?.length) {
            setCategoryChoices(parsedCache.categoryChoices)
            setEquipmentChoices(parsedCache.equipmentChoices)
            setMuscleChoices(parsedCache?.muscleChoices || [])
            setIsChoicesLoading(false)
            return
          }
        }
      } catch {
        localStorage.removeItem(CHOICES_CACHE_KEY)
      }

      try {
        const requestConfig = buildRequestConfig()
        let equipmentChoicesFromEndpoint = []

        try {
          const equipmentResponse = await axios.get(EQUIPMENT_API_URL, requestConfig)
          equipmentChoicesFromEndpoint = normalizeChoices(normalizeEquipmentPayload(equipmentResponse?.data))
        } catch {
          // Fall back to metadata choices when equipment endpoint is unavailable.
        }

        let metadata = null

        try {
          const optionsResponse = await axios.options(API_URL, requestConfig)
          if (optionsResponse?.status !== 204 && hasMetadataPayload(optionsResponse?.data)) {
            metadata = optionsResponse.data
          }
        } catch {
          // Fall back to GET when OPTIONS is unsupported or blocked.
        }

        if (!metadata) {
          const getResponse = await axios.get(API_URL, requestConfig)
          metadata = getResponse?.data
        }

        const category = getChoicesFromMetadata(metadata, ["category"])
        const equipment =
          equipmentChoicesFromEndpoint.length > 0
            ? equipmentChoicesFromEndpoint
            : getChoicesFromMetadata(metadata, ["equipment"])
        const muscle = getChoicesFromMetadata(metadata, ["primary_muscle_group", "muscle"])

        setCategoryChoices(category)
        setEquipmentChoices(equipment)
        setMuscleChoices(muscle)
        localStorage.setItem(
          CHOICES_CACHE_KEY,
          JSON.stringify({
            categoryChoices: category,
            equipmentChoices: equipment,
            muscleChoices: muscle,
            cachedAt: Date.now(),
          }),
        )
      } catch (error) {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          setErrorMessage("Please log in to load exercises and categories.")
          return
        }
        const message =
          error?.response?.data?.detail ||
          "Unable to load choices. Please refresh and try again."
        setErrorMessage(message)
      } finally {
        setIsChoicesLoading(false)
      }
    }

    loadChoices()
  }, [])

  const handleChange = (event) => {
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
      setIsAddModalOpen(false)
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

  const handleClearFilters = () => {
    setSearchName("")
    setOrdering("name")
    setFilters({
      category: "",
      equipment: "",
      muscle: "",
    })
    setVisibleCount(PAGE_SIZE)
  }

  const handleOpenAddModal = () => {
    setErrorMessage("")
    setFieldErrors({})
    setSuccessMessage("")
    setFormValues(getDefaultExerciseFormValues(currentUsername))
    setIsAddModalOpen(true)
  }

  const handleCloseAddModal = () => {
    setFormValues(EMPTY_EXERCISE_FORM_VALUES)
    setFieldErrors({})
    setErrorMessage("")
    setIsAddModalOpen(false)
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

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + PAGE_SIZE)
  }

  const handleOpenExerciseDetailsModal = (exerciseId) => {
    setSelectedExerciseId(exerciseId)
    setIsDetailsModalOpen(true)
  }

  const filteredExercises = exercises
  const displayedExercises = filteredExercises.slice(0, visibleCount)
  const hasMoreExercises = filteredExercises.length > displayedExercises.length
  const selectedExercise = filteredExercises.find((exercise) => (exercise.id ?? null) === selectedExerciseId) || null
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
    setVisibleCount(PAGE_SIZE)
  }, [searchName, ordering, filters])

  useEffect(() => {
    if (filteredExercises.length === 0) {
      setSelectedExerciseId(null)
      return
    }

    const hasSelectedExercise = filteredExercises.some((exercise) => (exercise.id ?? null) === selectedExerciseId)
    if (!hasSelectedExercise) {
      const fallbackId = filteredExercises[0]?.id ?? null
      setSelectedExerciseId(fallbackId)
    }
  }, [filteredExercises, selectedExerciseId])

  const categoryLookup = useMemo(
    () => Object.fromEntries(categoryChoices.map((choice) => [choice.value, choice.label])),
    [categoryChoices]
  )
  const equipmentLookup = useMemo(
    () => Object.fromEntries(equipmentChoices.map((choice) => [choice.value, choice.label])),
    [equipmentChoices]
  )

  useEffect(() => {
    const loadExerciseLibrary = async () => {
      setIsExerciseLibraryLoading(true)
      setExerciseLibraryError("")

      try {
        const response = await axios.get(EXERCISES_API_URL, buildRequestConfig())
        setExerciseLibrary(normalizeExercisesPayload(response?.data))
      } catch {
        setExerciseLibrary([])
        setExerciseLibraryError("Unable to load exercise library for workout planning.")
      } finally {
        setIsExerciseLibraryLoading(false)
      }
    }

    loadExerciseLibrary()
  }, [])

  return (
    <main className="exercise-page" aria-label="Exercise Library">
      <section className="exercise-top-actions">
        {!isLibraryModalOpen ? (
          <button type="button" className="exercise-primary-btn" onClick={handleOpenLibraryModal}>
            Open Exercise Library
          </button>
        ) : null}
      </section>

      {isLibraryModalOpen ? (
        <div className="exercise-modal-backdrop" role="presentation" onClick={handleCloseLibraryModal}>
          <aside
            className="exercise-modal exercise-library-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exercise-library-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="exercise-modal-header">
              <div>
                <h2 id="exercise-library-modal-title">Exercise Library</h2>
                <p>Search and review your exercise list.</p>
              </div>
              <button type="button" className="exercise-secondary-btn" onClick={handleCloseLibraryModal}>
                Close
              </button>
            </header>

            <section className="exercise-library-panel">
              <header className="exercise-panel-header">
                <div className="exercise-panel-header-top">
                  <div>
                    <h1>Exercise Library</h1>
                    <p>Search and review your exercise list.</p>
                  </div>
                  <div className="exercise-header-actions">
                    <button
                      type="button"
                      className="exercise-primary-btn"
                      onClick={handleOpenAddModal}
                      ref={addModalTriggerRef}
                    >
                      Add Exercise
                    </button>
                  </div>
                </div>
                <div className="exercise-counts" aria-live="polite" aria-atomic="true">
                  <span>{exercises.length} total</span>
                  <span>{displayedExercises.length} shown</span>
                </div>
              </header>

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
                  <select
                    name="category"
                    value={filters.category}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, category: event.target.value }))
                    }
                    disabled={isChoicesLoading}
                  >
                    <option value="">{isChoicesLoading ? "Loading..." : "All"}</option>
                    {categoryChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="exercise-field">
                  <span>Equipment</span>
                  <select
                    name="equipment"
                    value={filters.equipment}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, equipment: event.target.value }))
                    }
                    disabled={isChoicesLoading}
                  >
                    <option value="">{isChoicesLoading ? "Loading..." : "All"}</option>
                    {equipmentChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="exercise-field">
                  <span>Muscle</span>
                  <select
                    name="muscle"
                    value={filters.muscle}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, muscle: event.target.value }))
                    }
                    disabled={isChoicesLoading}
                  >
                    <option value="">{isChoicesLoading ? "Loading..." : "All"}</option>
                    {muscleChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="exercise-field exercise-field-wide">
                  <span>Sort by</span>
                  <select
                    name="ordering"
                    value={ordering}
                    onChange={(event) => setOrdering(event.target.value)}
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

              {isLoading && isSlowLoading ? (
                <p className="exercise-loading-note" role="status">Still loading exercises. Thanks for hanging tight.</p>
              ) : null}
              {errorMessage ? <p className="exercise-error" role="alert">{errorMessage}</p> : null}
              {successMessage ? <p className="exercise-success" role="status">{successMessage}</p> : null}

              <div
                className="exercise-list"
                role={!isLoading && filteredExercises.length > 0 ? "listbox" : undefined}
                aria-label={!isLoading && filteredExercises.length > 0 ? "Exercises" : undefined}
                aria-busy={isLoading}

                // TODO: Refactor exercise-list in excise component -- create a 
                // reusable function maybe in its own function  also for programs 
                // exercise list. see Line 1386 in Programs component.
                onKeyDown={(event) => {
                  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
                  if (filteredExercises.length === 0) return
                  event.preventDefault()
                  const currentIndex = displayedExercises.findIndex((ex) => (ex.id ?? null) === selectedExerciseId)
                  let nextIndex = currentIndex
                  if (event.key === "ArrowDown") nextIndex = Math.min(currentIndex + 1, displayedExercises.length - 1)
                  else if (event.key === "ArrowUp") nextIndex = Math.max(currentIndex - 1, 0)
                  else if (event.key === "Home") nextIndex = 0
                  else if (event.key === "End") nextIndex = displayedExercises.length - 1
                  if (nextIndex !== currentIndex) {
                    const nextExercise = displayedExercises[nextIndex]
                    setSelectedExerciseId(nextExercise.id ?? null)
                    const optionEl = nextExercise.id
                      ? event.currentTarget.querySelector(`#exercise-option-${nextExercise.id}`)
                      : null
                    optionEl?.focus()
                  }
                }}
              >
                {isLoading ? (
                  Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
                    <div className="exercise-item exercise-item-skeleton" key={`exercise-skeleton-${index}`} aria-hidden="true">
                      <div className="exercise-skeleton exercise-skeleton-title" />
                      <div className="exercise-skeleton exercise-skeleton-line" />
                      <div className="exercise-skeleton exercise-skeleton-line exercise-skeleton-line-short" />
                      <div className="exercise-skeleton exercise-skeleton-line" />
                    </div>
                  ))
                ) : filteredExercises.length === 0 ? (
                  <p className="exercise-empty" role="status">No exercises found.</p>
                ) : (
                  displayedExercises.map((exercise, index) => (
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
                        <span>{categoryLookup[exercise.category] || exercise.category}</span>
                      </div>
                      <p className="exercise-meta">
                        {equipmentLookup[exercise.equipment] || exercise.equipment} · {exercise.primary_muscle_group}
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

              {!isLoading && hasMoreExercises ? (
                <div className="exercise-list-actions">
                  <button type="button" className="exercise-secondary-btn" onClick={handleLoadMore}>
                    Load More
                  </button>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      ) : null}

      {isDetailsModalOpen && selectedExercise ? (
        <div className="exercise-modal-backdrop" role="presentation" onClick={handleCloseExerciseDetailsModal}>
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
          </aside>
        </div>
      ) : null}

      {isAddModalOpen ? (
        <div
          className="exercise-modal-backdrop"
          role="presentation"
          onClick={handleCloseAddModal}
        >
          <aside
            className="exercise-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exercise-modal-title"
            aria-describedby="exercise-modal-desc"
            ref={addModalRef}
            onKeyDown={handleAddModalKeyDown}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="exercise-modal-header">
              <div>
                <h2 id="exercise-modal-title">Add Exercise</h2>
                <p id="exercise-modal-desc">Create a new exercise in your library.</p>
              </div>
              <button
                type="button"
                className="exercise-secondary-btn"
                aria-label="Close Add Exercise dialog"
                onClick={handleCloseAddModal}
              >
                Close
              </button>
            </header>

            <form className="exercise-form" onSubmit={handleSubmit} noValidate>
              {errorMessage ? <p className="exercise-error" role="alert">{errorMessage}</p> : null}

              <label className="exercise-field">
                <span>Name</span>
                <input
                  type="text"
                  name="name"
                  value={formValues.name}
                  onChange={handleChange}
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
                  onChange={handleChange}
                  placeholder="Optional details"
                />
                {fieldErrors.description ? <small className="exercise-field-error">{fieldErrors.description}</small> : null}
              </label>

              <label className="exercise-field">
                <span>Category</span>
                <select
                  name="category"
                  value={formValues.category}
                  onChange={handleChange}
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
                {fieldErrors.category ? <small className="exercise-field-error">{fieldErrors.category}</small> : null}
              </label>

              <label className="exercise-field">
                <span>Equipment</span>
                <select
                  name="equipment"
                  value={formValues.equipment}
                  onChange={handleChange}
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
                {fieldErrors.equipment ? <small className="exercise-field-error">{fieldErrors.equipment}</small> : null}
              </label>

              <label className="exercise-field">
                <span>Created by</span>
                <input
                  type="text"
                  name="created_by"
                  value={currentUsername || formValues.created_by}
                  placeholder="Coach or athlete"
                  readOnly
                  aria-readonly="true"
                />
                {fieldErrors.created_by ? <small className="exercise-field-error">{fieldErrors.created_by}</small> : null}
              </label>

              <label className="exercise-field">
                <span>Muscle</span>
                <select
                  name="primary_muscle_group"
                  value={formValues.primary_muscle_group}
                  onChange={handleChange}
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
                {fieldErrors.primary_muscle_group ? <small className="exercise-field-error">{fieldErrors.primary_muscle_group}</small> : null}
              </label>

              <label className="exercise-checkbox">
                <input
                  type="checkbox"
                  name="is_public"
                  checked={formValues.is_public}
                  onChange={handleChange}
                />
                Public exercise
              </label>
              {fieldErrors.is_public ? <small className="exercise-field-error">{fieldErrors.is_public}</small> : null}

              <button className="exercise-primary-btn" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Add Exercise"}
              </button>
            </form>
          </aside>
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
