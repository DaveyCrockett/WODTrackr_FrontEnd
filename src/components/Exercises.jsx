import "../CSS/exercises.css"
import axios from "axios"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { validateExerciseForm } from "../utils/exerciseUtils"
import FilterIcon from "../assets/filter.png"
import MultiSelect from "./MultiSelect"

const API_URL = "/api/wodtrackr/exercises/"
const EXERCISES_API_URL = "/api/wodtrackr/exercises/"
const CUSTOM_EXERCISES_API_URL = "/api/wodtrackr/custom-exercises/"
const PAGE_SIZE = 6
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
  difficulty: "",
  image: null,
  is_public: false,
  detail: {
    instructions: [""],
  },
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
      .map(([value, label]) => ({ value, label: String(label) }))
      .filter((choice) => choice.value !== "" && choice.value !== null && choice.value !== undefined)
  }

  if (!Array.isArray(choices)) {
    return []
  }

  return choices
    .map((choice) => {
      if (Array.isArray(choice)) {
        const [value, label] = choice
        return { value, label: label ?? String(value ?? "") }
      }

      if (choice && typeof choice === "object") {
        const value = choice.value ?? choice.id ?? choice.key ?? ""
        const label = choice.label ?? choice.name ?? choice.display_name ?? String(value)
        return { value, label }
      }

      return { value: choice, label: String(choice) }
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

const getExerciseGifUrl = (exercise) => {
  if (!exercise || typeof exercise !== "object") {
    return ""
  }

  const videoValue =
    exercise?.gif_absolute_url ??
    exercise?.gif_url ??
    exercise?.gifUrl ??
    exercise?.exercise_gif ??
    exercise?.exerciseGif ??
    ""

  return typeof videoValue === "string" ? videoValue.trim() : ""
}

const normalizeMediaUrlForFrontend = (urlValue) => {
  const trimmedUrl = typeof urlValue === "string" ? urlValue.trim() : ""
  if (!trimmedUrl) {
    return ""
  }

  if (!import.meta.env.DEV) {
    return trimmedUrl
  }

  if (trimmedUrl.startsWith("/media/")) {
    return trimmedUrl
  }

  if (trimmedUrl.startsWith("media/")) {
    return `/${trimmedUrl}`
  }

  if (trimmedUrl.startsWith("exercise_dataset/")) {
    return `/media/${trimmedUrl}`
  }

  const mediaPathIndex = trimmedUrl.indexOf("/media/")
  if (mediaPathIndex >= 0) {
    return trimmedUrl.slice(mediaPathIndex)
  }

  const hostlessMediaMatch = trimmedUrl.match(/^[^\s/]+:\d+\/(media\/.*)$/i)
  if (hostlessMediaMatch?.[1]) {
    return `/${hostlessMediaMatch[1]}`
  }

  try {
    const candidateUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `http://${trimmedUrl}`
    const parsedUrl = new URL(candidateUrl, window.location.origin)
    if (parsedUrl.pathname.startsWith("/media/")) {
      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
    }
  } catch {
    return trimmedUrl
  }

  return trimmedUrl
}

const getExerciseImageUrl = (exercise) => {
  if (!exercise || typeof exercise !== "object") {
    return ""
  }
  const imageValue =
    exercise?.image ??
    exercise?.imageAbsoluteUrl ??
    exercise?.image_url ??
    exercise?.imageUrl ??
    exercise?.exercise_image_url ??
    exercise?.exerciseImageUrl ??
    exercise?.exercise_image ??
    exercise?.exerciseImage ??
    exercise?.thumbnail_url ??
    exercise?.thumbnailUrl ??
    exercise?.image ??
    ""

  return normalizeMediaUrlForFrontend(imageValue)
}

const canonicalizeEquipmentValue = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ")
  if (normalized === "bodyweight") return "body weight"
  return normalized
}

const getFieldErrorsFromResponse = (data) => {
  if (!data || typeof data !== "object") {
    return {}
  }

  const possibleFields = ["name", "instructions", "category", "equipment", "primary_muscle_group","secondary_muscle_group", "gif_url", "image_upload", "image_url", "created_by", "is_public"]
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
  instructions: exercise?.detail.instructions || [],
  category: exercise?.category || "",
  equipment: exercise?.equipment || "",
  secondary_muscle_group: exercise?.secondary_muscle_group || "",
  gif_url: exercise?.gif_url || "",
  image: exercise?.image || "",
  image_upload: exercise?.image_upload || "",
  primary_muscle_group: exercise?.primary_muscle_group || "",
  created_by: exercise?.created_by_username || exercise?.username || exercise?.created_by || "",
  is_public: Boolean(exercise?.is_public),
})


function Exercises({
  handleFilterChange = () => {},
  isChoicesLoading = false,
  categoryChoices = [],
  equipmentChoices = [],
  muscleChoices = [],
  bodyPartChoices = [],
  targetChoices = [],
  exerciseLibraryState,
  setExerciseLibraryState = () => {},
  handleSearchChange = () => {},
  handleSortChange = () => {},
  handleClearFilters = () => {},
  sortOrder = "asc",
  setSortOrder = () => {},
  filters,
  setFilters = () => {},
  setIsChoicesLoading = () => {},
}) {
  const [selectedExerciseId, setSelectedExerciseId] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(true)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editErrorMessage, setEditErrorMessage] = useState("")
  const [editFieldErrors, setEditFieldErrors] = useState({})
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false)
  const [formValues, setFormValues] = useState(() => getDefaultExerciseFormValues(getStoredUsername()))
  const [editFormValues, setEditFormValues] = useState(EMPTY_EXERCISE_FORM_VALUES)
  const [exercisesErrorMessage, setExercisesErrorMessage] = useState("")
  const [visibleExerciseCount, setVisibleExerciseCount] = useState(PAGE_SIZE)

  // Refs for modal focus management
  const addModalRef = useRef(null)
  const editModalRef = useRef(null)
  const addModalTriggerRef = useRef(null)
  const editModalTriggerRef = useRef(null)
  const addModalPreviouslyOpen = useRef(false)
  const editModalPreviouslyOpen = useRef(false)

  const resolvedExerciseLibraryState = exerciseLibraryState ?? {
    exerciseLibrary: [],
    isExerciseLibraryLoading: false,
    exerciseLibraryError: "",
  }
  const resolvedFilters = filters ?? {
    searchName: "",
    category: [],
    equipment: [],
    muscle: [],
    bodyPart: [],
    target: [],
  }
  const {
    exerciseLibrary = [],
    isExerciseLibraryLoading = false,
    exerciseLibraryError = "",
  } = resolvedExerciseLibraryState


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
    const library = exerciseLibrary || []
    let result = [...library]
    
    try {
      if (resolvedFilters.searchName.trim()) {
        const query = resolvedFilters.searchName.trim().toLowerCase()
        result = result.filter(
          (p) =>
            String(p?.title || p?.name || "").toLowerCase().includes(query) ||
            String(p?.detail?.instructions || "").toLowerCase().includes(query) ||
            String(p?.category || "").toLowerCase().includes(query) ||
            String(p?.equipment || "").toLowerCase().includes(query) ||
            String(p?.body_part || "").toLowerCase().includes(query) ||
            String(p?.primary_muscle_group || p?.muscle_group || "").toLowerCase().includes(query) ||
            String(p?.target || p?.target_muscle || "").toLowerCase().includes(query),
        )
      }

      if (Array.isArray(resolvedFilters.category) && resolvedFilters.category.length > 0) {
        result = result.filter((p) => resolvedFilters.category.includes(p.category))
      }
      if (Array.isArray(resolvedFilters.equipment) && resolvedFilters.equipment.length > 0) {
        const selectedEquipment = new Set(resolvedFilters.equipment.map((entry) => canonicalizeEquipmentValue(entry)))
        result = result.filter((p) => selectedEquipment.has(canonicalizeEquipmentValue(p.equipment)))
      }
      if (Array.isArray(resolvedFilters.muscle) && resolvedFilters.muscle.length > 0) {
        result = result.filter((p) =>
          resolvedFilters.muscle.includes(p.primary_muscle_group || p.muscle_group || ""),
        )
      }
      if (Array.isArray(resolvedFilters.bodyPart) && resolvedFilters.bodyPart.length > 0) {
        result = result.filter((p) => resolvedFilters.bodyPart.includes(p.body_part))
      }
      if (Array.isArray(resolvedFilters.target) && resolvedFilters.target.length > 0) {
        result = result.filter((p) => resolvedFilters.target.includes(p.target || p.target_muscle))
      }
      result.sort((a, b) => {
        const aName = String(a?.title || a?.name || "")
        const bName = String(b?.title || b?.name || "")
        const aCreated = new Date(a?.created_at || 0).getTime()
        const bCreated = new Date(b?.created_at || 0).getTime()
        const aUpdated = new Date(a?.updated_at || 0).getTime()
        const bUpdated = new Date(b?.updated_at || 0).getTime()

        if (sortOrder === "-name" || sortOrder === "desc") {
          return bName.localeCompare(aName)
        }
        if (sortOrder === "created_at") {
          return aCreated - bCreated
        }
        if (sortOrder === "-created_at") {
          return bCreated - aCreated
        }
        if (sortOrder === "updated_at") {
          return aUpdated - bUpdated
        }
        if (sortOrder === "-updated_at") {
          return bUpdated - aUpdated
        }
        return aName.localeCompare(bName)
      })
      return result
    } catch (error) {
      return []
    }
  }, [exerciseLibrary, resolvedFilters.searchName, resolvedFilters.category, resolvedFilters.equipment, resolvedFilters.muscle, resolvedFilters.bodyPart, resolvedFilters.target, sortOrder]);

  useEffect(() => {
    setVisibleExerciseCount(PAGE_SIZE)
  }, [filteredAndSortedLibrary.length, sortOrder, resolvedFilters.searchName, resolvedFilters.category, resolvedFilters.equipment, resolvedFilters.muscle, resolvedFilters.bodyPart, resolvedFilters.target])

  const visibleExercises = useMemo(
    () => filteredAndSortedLibrary.slice(0, visibleExerciseCount),
    [filteredAndSortedLibrary, visibleExerciseCount],
  )

  const hasMoreVisibleExercises = visibleExerciseCount < filteredAndSortedLibrary.length

  const handleLoadMoreExercises = () => {
    setVisibleExerciseCount((previousCount) => previousCount + PAGE_SIZE)
  }


  const normalizeExercisesPayload = (data) => {
    if (Array.isArray(data?.data)) return data.data
    if (Array.isArray(data?.results)) return data.results
    if (Array.isArray(data)) return data
    return []
  }

  const handleAddSubmit = async (event) => {
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
      const payload = new FormData()
      payload.append("name", formValues.name)
      console.log("Form values before appending instructions:", formValues.detail.instructions)
      payload.append("instructions", JSON.stringify(formValues.detail.instructions) || "")
      payload.append("category", formValues.category)
      payload.append("equipment", formValues.equipment)
      payload.append("primary_muscle_group", formValues.primary_muscle_group)
      payload.append("is_public", String(Boolean(formValues.is_public)))
      payload.append("body_part", formValues.body_part || "")
      payload.append("target", formValues.target || "")
      payload.append("difficulty", formValues.difficulty || "")
      payload.append("secondary_muscle_group", formValues.secondary_muscle_group || "")


      if (formValues.image_upload instanceof File) {
        payload.append("image_upload", formValues.image_upload)
      }

      if (formValues.gif_url instanceof File) {
        payload.append("gif_url", formValues.gif_url)
      }

      const response = await axios.post(`${API_URL}`, payload, buildRequestConfig())
      const createdExercise = response?.data?.data ?? response?.data
      if (createdExercise) {
        setExerciseLibraryState((prevState) => ({
          ...prevState,
          exerciseLibrary: [createdExercise, ...(prevState?.exerciseLibrary || [])],
        }))
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
        error?.response?.data?.detail?.instructions ||
        "Unable to save exercise. Please check your inputs."
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    console.log("Updated state inside useEffect:", formValues.detail, typeof formValues.detail)
  }, [formValues])

  const handleAddChange = (event) => {
    const { name, value, type, checked, files } = event.target
    const inputValue = type === "textarea" ? value :  value;
    setFormValues((prev) => {
      console.log(name === "instructions", "inputValue:", inputValue)
      if (name === "instructions") {
        return {
          ...prev,
          detail: {
            ...prev.detail,
            instructions: [inputValue],
          },
        }
      }
      return {
        ...prev,
        [name]: inputValue,
      }
    })
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
    if (fieldErrors.detail?.instructions) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.detail.instructions
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

  const toSubTitleCase = (str) => {
    if (!str) return ""
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
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
      const response = await axios.put(
        `${API_URL}${selectedExercise.id}/`,
        {
          name: editFormValues.name,
          instructions: editFormValues.detail?.instructions,
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
        setExerciseLibraryState((prevState) => ({
          ...prevState,
          exerciseLibrary: (prevState?.exerciseLibrary || []).map((exercise) =>
            exercise.id === updatedExercise.id ? updatedExercise : exercise,
          ),
        }))
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
      setExerciseLibraryState((prevState) => ({
        ...prevState,
        exerciseLibrary: (prevState?.exerciseLibrary || []).filter((exercise) => exercise.id !== selectedExercise.id),
      }))
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

  function capitalizeFirstLetter(str) {
    if (!str) return ''; // Handle empty strings safely
    return str.charAt(0).toUpperCase() + str.slice(1);
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
      try {
        const response = await axios.get(EXERCISES_API_URL, config)
        const nextNode = response?.data?.next
        setExerciseLibraryState((prevState) => ({
          ...prevState,
          isExerciseLibraryLoading: false,
          exerciseLibraryError: '',
          exerciseLibrary: normalizeExercisesPayload(response?.data.all_exercises || response?.data || []),
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
  }, [resolvedFilters.searchName, sortOrder, resolvedFilters])

  useEffect(() => {
    if (exerciseLibrary.length === 0) {
      setSelectedExerciseId(null)
      return
    }
  }, [exerciseLibrary])


  return (
    <main className="exercise-page" aria-label="Exercise Library">
      <section className="exercise-library-panel">
        <header className="exercise-panel-header">
          <div className="exercise-panel-header-top">
            <h1>Exercise Library</h1>
            <button className="exercise-primary-btn" type="submit" disabled={isAddModalOpen} onClick={() => handleAddExercise()}>
              Add Exercise
            </button>
          </div>
          <p>Browse and manage exercises in the library. Use the search and filter options to find specific exercises.</p>
          <div className="exercise-counts" aria-live="polite" aria-atomic="true">
            <span>{filteredAndSortedLibrary ? filteredAndSortedLibrary.length : exerciseLibrary.length} total</span>
          </div>
        </header>
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
          {isExerciseLibraryLoading ? (
            Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
              <div className="exercise-item exercise-item-skeleton" key={`exercise-skeleton-${index}`} aria-hidden="true">
                <div className="exercise-skeleton exercise-skeleton-title" />
                <div className="exercise-skeleton exercise-skeleton-line" />
                <div className="exercise-skeleton exercise-skeleton-line exercise-skeleton-line-short" />
                <div className="exercise-skeleton exercise-skeleton-line" />
              </div>
            ))
          ) : filteredAndSortedLibrary.length === 0 ? (
            <p className="exercise-empty" role="status">No exercises found.</p>
          ) : (
            visibleExercises.map((exercise, index) => {
              const exerciseImageUrl = getExerciseImageUrl(exercise)
              return (
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
                {exerciseImageUrl ? (
                  <div className="exercise-card-image-wrap" aria-hidden="true">
                    <img
                      src={exerciseImageUrl}
                      alt=""
                      loading="lazy"
                      className="exercise-card-image"
                      onError={(event) => {
                        event.currentTarget.style.display = "none"
                      }}
                    />
                  </div>
                ) : null}
                <div>
                  <h3 className="exercise-header-title">{(exercise.title || exercise.name || "Exercise").toUpperCase()}</h3>
                  <div className="exercise-header">
                    <span><strong>Visibility:</strong> {capitalizeFirstLetter(exercise.is_public ? "Public" : "Private")}</span>
                    <span><strong>Category:</strong> {capitalizeFirstLetter(exercise.category)}</span>
                    <p className="exercise-meta">
                      <strong>Primary Muscle:</strong> {capitalizeFirstLetter(exercise.primary_muscle_group)}
                    </p>
                    <p className="exercise-meta">
                      <strong>Created by:</strong> {capitalizeFirstLetter(exercise.created_by_username || exercise.username || exercise.created_by || "Unknown")} 
                    </p>
                  </div>
                </div>
              </article>
              )
            })
          )}
        </div>
        {!isExerciseLibraryLoading && hasMoreVisibleExercises ? (
          <div className="exercise-search-actions">
            <button type="button" className="exercise-secondary-btn" onClick={handleLoadMoreExercises}>
              Load More
            </button>
          </div>
        ) : null}
      </section>
      <section className="exercise-form-panel">
        <div className="exercise-search-header">
          <h2>Search & Filter</h2>
          <p>Filter the exercise library by name, category, body part, equipment, muscle group, or target.</p>
        </div>
        <div className="exercise-search-grid">
          <label className="exercise-field exercise-field-wide">
            <span>Search by name</span>
            <input
              type="text"
              name="name"
              value={resolvedFilters.searchName || ""}
              onChange={(event) => handleFilterChange("searchName", event.target.value)}
              placeholder="Back squat, pull-up, row"
            />
          </label>

          <label className="exercise-field">
            <span>Category</span>
            <MultiSelect
              options={categoryChoices}
              value={resolvedFilters.category || []}
              onChange={(selectedValues) => handleFilterChange("category", selectedValues)}
              name="category"
            />
          </label>

          <label className="exercise-field">
            <span>Equipment</span>
            <MultiSelect
              options={equipmentChoices}
              value={resolvedFilters.equipment || []}
              onChange={(selectedValues) => handleFilterChange("equipment", selectedValues)}
              name="equipment"
            />
          </label>

          <label className="exercise-field">
            <span>Muscle</span>
            <MultiSelect
              options={muscleChoices}
              value={resolvedFilters.muscle || []}
              onChange={(selectedValues) => handleFilterChange("muscle", selectedValues)}
              name="muscle"
            />
          </label>

          <label className="exercise-field">
            <span>Body Part</span>
            <MultiSelect
              options={bodyPartChoices}
              value={resolvedFilters.bodyPart || []}
              onChange={(selectedValues) => handleFilterChange("bodyPart", selectedValues)}
              name="body_part"
            />
          </label>

          <label className="exercise-field">
            <span>Target</span>
            <MultiSelect
              options={targetChoices}
              value={resolvedFilters.target || []}
              onChange={(selectedValues) => handleFilterChange("target", selectedValues)}
              name="target"
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
          <button type="button" className="exercise-secondary-btn" onClick={() => handleClearFilters()}>
            Clear Filters
          </button>
        </div>
      </section>
      {isAddModalOpen ? (
        <div className="exercise-modal-backdrop">
          <aside className="exercise-modal" role="dialog" aria-modal="true" aria-labelledby="exercise-modal-title" aria-describedby="exercise-modal-desc" ref={addModalRef}>
            <header className="exercise-modal-header">
              <div className="exercise-modal-close-btn-wrapper">
                <button type="button" className="exercise-btn-base exercise-modal-close-btn" onClick={handleCloseAddModal}>
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="exercise-modal-title-wrapper">
                <h2 id="exercise-modal-title">Add Exercise</h2>
                <p id="exercise-modal-desc">Create a new exercise in your library.</p>
              </div>
            </header>

            <form className="exercise-form" onSubmit={handleAddSubmit}>
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
                <span>Instructions</span>
                <textarea
                  name="instructions"
                  value={Array.isArray(formValues.detail?.instructions) 
                    ? formValues.detail.instructions.join("\n") // Turns ['Step 1', 'Step 2'] into readable text
                    : formValues.detail?.instructions || ""
                  }
                  onChange={handleAddChange}
                  rows={4}
                  maxLength={1000}
                  placeholder="Type instructions here..."
                />
                {fieldErrors.instructions ? (
                <small className="exercise-field-error">
                  {Array.isArray(fieldErrors.instructions) ? fieldErrors.instructions[0] : fieldErrors.instructions}
                </small>
              ) : null}
              </label>

              <label className="exercise-field">
                <span>Category</span>
                <select
                  name="category"
                  value={typeof formValues.category === "string" ? formValues.category : ""}
                  onChange={handleAddChange}
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
                  onChange={handleAddChange}
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
                <span>Primary Muscle</span>
                <select
                  name="primary_muscle_group"
                  value={formValues.primary_muscle_group}
                  onChange={handleAddChange}
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
              <label className="exercise-field">
                <span>Secondary Muscle</span>
                <select
                  name="secondary_muscle_group"
                  value={formValues.secondary_muscle_group}
                  onChange={handleAddChange}
                  disabled={isChoicesLoading}
                >
                  <option value="">{isChoicesLoading ? "Loading muscle groups..." : "Select muscle group"}</option>
                  {muscleChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.secondary_muscle_group ? <small className="exercise-field-error">{fieldErrors.secondary_muscle_group}</small> : null}
              </label>
              <label className="exercise-field">
                <span>Image Upload</span>
                <input
                  type="file"
                  name="image"
                  accept="image/*"
                  onChange={handleAddChange}
                />
                {fieldErrors.image_upload ? <small className="exercise-field-error">{fieldErrors.image_upload}</small> : null}
              </label>

              <label className="exercise-checkbox">
                <input
                  type="checkbox"
                  name="is_public"
                  checked={formValues.is_public}
                  onChange={handleAddChange}
                />
                Public exercise
              </label>
              {fieldErrors.is_public ? <small className="exercise-field-error">{fieldErrors.is_public}</small> : null}



              <div className="exercise-form-actions">
                <button type="submit" className="exercise-primary-btn" disabled={isSubmitting}>
                  {isSubmitting ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
            {errorMessage && <p className="exercise-form-error">{errorMessage}</p>}
            {successMessage && <p className="exercise-form-success">{successMessage}</p>}
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

            <form className="exercise-form" onSubmit={handleEditSubmit}>
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
