// Utility functions for Exercise Library
// These are extracted from Exercises.jsx to make them testable and reusable

export const normalizeChoices = (choices) => {
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

export const extractChoicesFromFieldConfig = (fieldConfig) => {
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

export const getChoicesFromMetadata = (metadata, fieldNames) => {
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

export const formatTimestamp = (value) => {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export const getFieldErrorsFromResponse = (data) => {
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

export const getExerciseFormValues = (exercise) => ({
  name: exercise?.name || "",
  description: exercise?.description || "",
  category: exercise?.category || "",
  equipment: exercise?.equipment || "",
  primary_muscle_group: exercise?.primary_muscle_group || "",
  created_by: exercise?.created_by_username || exercise?.username || exercise?.created_by || "",
  is_public: Boolean(exercise?.is_public),
})

export const getAuthToken = () => {
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

export const getStoredUsername = () => {
  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    const userData = rawValue ? JSON.parse(rawValue) : null
    return userData?.username || ""
  } catch {
    return ""
  }
}

export const buildRequestConfig = (overrides = {}) => {
  const authToken = getAuthToken()
  return {
    ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
    ...overrides,
  }
}

export const validateExerciseForm = (values) => {
  const errors = {}

  if (!values.name || !values.name.trim()) {
    errors.name = "Name is required."
  } else if (values.name.trim().length > 200) {
    errors.name = "Name must be 200 characters or fewer."
  }

  if (!values.category) {
    errors.category = "Category is required."
  }

  if (!values.equipment) {
    errors.equipment = "Equipment is required."
  }

  if (!values.primary_muscle_group) {
    errors.primary_muscle_group = "Muscle group is required."
  }

  return errors
}
