import "../CSS/programs.css"
import "../CSS/multiselect.css"
import axios from "axios"
import { useEffect, useMemo, useRef, useState } from "react"
import MultiSelect from "./MultiSelect"

const API_URL = "/api/wodtrackr/exercise-programs/"
const EQUIPMENT_API_URL = "/api/wodtrackr/equipment/"
const STRIPE_CHECKOUT_API_URL = String(
  import.meta.env.VITE_CHECKOUT_SESSION_API_URL || "/api/users/billing/stripe/checkout-session/",
).trim()
const WORKOUTS_STORAGE_KEY = "wodtrackrWorkouts"
const PURCHASED_PROGRAMS_STORAGE_KEY = "wodtrackrPurchasedProgramIds"
const PENDING_CHECKOUT_PROGRAM_ID_STORAGE_KEY = "wodtrackrPendingCheckoutProgramId"
const PROGRAMS_PER_PAGE = 10
const DEFAULT_DIFFICULTIES = ["All Levels", "Beginner", "Intermediate", "Advanced"]
const DEFAULT_DURATION_MIN = 1
const DEFAULT_DURATION_MAX = 12
const PROGRAMS_CHOICES_CACHE_KEY = "wodtrackrProgramChoicesV4"
const CHOICES_CACHE_TTL_MS = 1000 * 60 * 60 * 12
const hasMetadataPayload = (value) => Boolean(value && typeof value === "object" && Object.keys(value).length > 0)

const normalizeDurationWeeks = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

const buildProgramItemsApiUrl = (programId) => `${API_URL}${programId}/item/`
const buildProgramItemDetailApiUrl = (programId, itemId) => `${API_URL}${programId}/item/${itemId}/`

const normalizeProgramItemsPayload = (data) => {
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data)) return data
  return []
}

const buildProgramItemsFromWorkoutPlan = (workoutPlan) => {
  let position = 1
  const items = []

  for (const weekEntry of Array.isArray(workoutPlan) ? workoutPlan : []) {
    const weekNumber = Number(weekEntry?.week_number)
    if (!Number.isFinite(weekNumber) || weekNumber < 1) continue

    for (const exerciseId of Array.isArray(weekEntry?.exercise_ids) ? weekEntry.exercise_ids : []) {
      const normalizedExerciseId = Number(exerciseId)
      if (!Number.isFinite(normalizedExerciseId)) continue
      items.push({
        exercise: normalizedExerciseId,
        position,
        week: weekNumber,
        day: 1,
      })
      position += 1
    }
  }

  return items
}

const normalizeProgramItemRecord = (item, fallbackPosition = 1) => {
  const exercise = Number(item?.exercise_id ?? item?.exercise?.id ?? item?.exercise)
  const week = Number(item?.week)
  if (!Number.isFinite(exercise) || !Number.isFinite(week) || week < 1) return null

  const dayCandidate = Number(item?.day)
  const positionCandidate = Number(item?.position)
  const idCandidate = Number(item?.id)

  return {
    id: Number.isFinite(idCandidate) ? idCandidate : null,
    exercise,
    week,
    day: Number.isFinite(dayCandidate) && dayCandidate > 0 ? dayCandidate : 1,
    position: Number.isFinite(positionCandidate) && positionCandidate > 0 ? positionCandidate : fallbackPosition,
  }
}

const normalizeProgramItemsForSync = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item, index) => normalizeProgramItemRecord(item, index + 1))
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)

const areProgramItemsEquivalent = (left, right) =>
  Number(left?.exercise) === Number(right?.exercise) &&
  Number(left?.week) === Number(right?.week) &&
  Number(left?.day ?? 1) === Number(right?.day ?? 1) &&
  Number(left?.position) === Number(right?.position)

const syncProgramItemsByItemUrl = async (programId, existingItems, nextItems) => {
  const endpoint = buildProgramItemsApiUrl(programId)
  const requestConfig = buildRequestConfig()
  const currentItems = normalizeProgramItemsForSync(existingItems)
  const desiredItems = normalizeProgramItemsForSync(nextItems)
  const maxLength = Math.max(currentItems.length, desiredItems.length)

  for (let index = 0; index < maxLength; index += 1) {
    const existingItem = currentItems[index]
    const desiredItem = desiredItems[index]

    if (existingItem && desiredItem) {
      if (!Number.isFinite(existingItem.id)) {
        await axios.post(endpoint, desiredItem, requestConfig)
        continue
      }
      if (!areProgramItemsEquivalent(existingItem, desiredItem)) {
        await axios.put(buildProgramItemDetailApiUrl(programId, existingItem.id), desiredItem, requestConfig)
      }
      continue
    }

    if (desiredItem && !existingItem) {
      await axios.post(endpoint, desiredItem, requestConfig)
      continue
    }

    if (existingItem && Number.isFinite(existingItem.id)) {
      await axios.delete(buildProgramItemDetailApiUrl(programId, existingItem.id), requestConfig)
    }
  }

  try {
    const refreshedItemsResponse = await axios.get(endpoint, requestConfig)
    return normalizeProgramItemsPayload(refreshedItemsResponse?.data)
  } catch {
    return null
  }
}

const syncProgramItems = async (programId, itemsPayload, replaceExisting = false) => {
  const endpoint = buildProgramItemsApiUrl(programId)
  const requestConfig = buildRequestConfig()

  if (replaceExisting) {
    let didClearExistingItems = false

    try {
      await axios.delete(endpoint, requestConfig)
      didClearExistingItems = true
    } catch {
      // Some APIs do not support bulk DELETE on the list endpoint.
    }

    if (!didClearExistingItems) {
      try {
        const existingItemsResponse = await axios.get(endpoint, requestConfig)
        const existingItems = normalizeProgramItemsPayload(existingItemsResponse?.data)
        await Promise.all(
          existingItems
            .map((item) => Number(item?.id))
            .filter((itemId) => Number.isFinite(itemId))
            .map((itemId) => axios.delete(buildProgramItemDetailApiUrl(programId, itemId), requestConfig)),
        )
      } catch {
        // If individual cleanup fails, continue and let create attempts surface errors.
      }
    }
  }

  for (const item of Array.isArray(itemsPayload) ? itemsPayload : []) {
    await axios.post(endpoint, item, requestConfig)
  }
}

const buildWorkoutPlanFromProgramItems = (items, durationValue) => {
  const grouped = (Array.isArray(items) ? items : []).reduce((accumulator, item) => {
    const exerciseId = Number(item?.exercise_id ?? item?.exercise?.id ?? item?.exercise)
    if (!Number.isFinite(exerciseId)) return accumulator

    const weekNumber = Number(item?.week)
    const targetWeek = Number.isFinite(weekNumber) && weekNumber > 0 ? weekNumber : 1
    if (!accumulator[targetWeek]) accumulator[targetWeek] = new Set()
    accumulator[targetWeek].add(exerciseId)
    return accumulator
  }, {})

  const basePlan = Object.entries(grouped)
    .map(([weekNumber, exerciseIds]) => ({
      week_number: Number(weekNumber),
      exercise_ids: [...exerciseIds],
    }))
    .sort((a, b) => a.week_number - b.week_number)

  return buildWorkoutPlanForDuration(durationValue, basePlan)
}

const buildWorkoutPlanForDuration = (durationValue, previousPlan = []) => {
  const weeks = normalizeDurationWeeks(durationValue)
  if (weeks === 0) return []

  const planByWeek = new Map(
    (Array.isArray(previousPlan) ? previousPlan : []).map((entry) => [
      Number(entry?.week_number),
      Array.isArray(entry?.exercise_ids)
        ? entry.exercise_ids
            .map((exerciseId) => Number(exerciseId))
            .filter((exerciseId) => Number.isFinite(exerciseId))
        : [],
    ]),
  )

  return Array.from({ length: weeks }, (_, index) => {
    const weekNumber = index + 1
    return {
      week_number: weekNumber,
      exercise_ids: [...new Set(planByWeek.get(weekNumber) ?? [])],
    }
  })
}

const getWorkoutPlanValidationMessage = (durationValue, workoutPlan) => {
  const normalizedWorkoutPlan = buildWorkoutPlanForDuration(durationValue, workoutPlan)
  if (normalizedWorkoutPlan.length === 0) return ""

  const weeksWithExercises = normalizedWorkoutPlan.filter((weekEntry) => weekEntry.exercise_ids.length > 0)
  if (weeksWithExercises.length === 0) {
    return "Add at least 1 workout to your program."
  }

  if (weeksWithExercises.length !== normalizedWorkoutPlan.length) {
    return "Each week in the workout plan must include at least 1 workout."
  }

  return ""
}

const areWorkoutPlansEqual = (leftPlan, rightPlan) => {
  const normalizePlan = (plan) =>
    (Array.isArray(plan) ? plan : [])
      .map((weekEntry) => ({
        week_number: Number(weekEntry?.week_number),
        exercise_ids: [...new Set((Array.isArray(weekEntry?.exercise_ids) ? weekEntry.exercise_ids : [])
          .map((exerciseId) => Number(exerciseId))
          .filter((exerciseId) => Number.isFinite(exerciseId)))].sort((a, b) => a - b),
      }))
      .filter((weekEntry) => Number.isFinite(weekEntry.week_number) && weekEntry.week_number > 0)
      .sort((a, b) => a.week_number - b.week_number)

  const left = normalizePlan(leftPlan)
  const right = normalizePlan(rightPlan)
  if (left.length !== right.length) return false

  return left.every((weekEntry, index) => {
    const rightWeekEntry = right[index]
    if (!rightWeekEntry) return false
    if (weekEntry.week_number !== rightWeekEntry.week_number) return false
    if (weekEntry.exercise_ids.length !== rightWeekEntry.exercise_ids.length) return false
    return weekEntry.exercise_ids.every((exerciseId, exerciseIndex) => exerciseId === rightWeekEntry.exercise_ids[exerciseIndex])
  })
}

const clearFormFieldError = (previousErrors, fieldName, clearWorkoutPlan = false) => ({
  ...previousErrors,
  [fieldName]: "",
  ...(clearWorkoutPlan ? { workout_plan: "" } : {}),
})

const toExerciseId = (value) => {
  const candidate = Number(value)
  return Number.isFinite(candidate) ? candidate : null
}

const extractExerciseIds = (value) => {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (entry && typeof entry === "object") {
        return toExerciseId(entry.id ?? entry.exercise_id ?? entry.exercise)
      }
      return toExerciseId(entry)
    })
    .filter((entry) => entry !== null)
}

const buildWorkoutPlanFromProgram = (program) => {
  if (!program || typeof program !== "object") return []

  const candidateWorkoutPlan =
    program.workout_plan ?? program.weekly_plan ?? program.plan ?? program.sessions ?? program.program_sessions ?? []

  const mappedFromWorkoutPlan = Array.isArray(candidateWorkoutPlan)
    ? candidateWorkoutPlan
        .map((entry) => {
          const weekNumber = Number(entry?.week_number ?? entry?.week ?? entry?.weekNumber)
          if (!Number.isFinite(weekNumber) || weekNumber < 1) return null

          const explicitIds = extractExerciseIds(entry?.exercise_ids)
          const fromExercises = extractExerciseIds(entry?.exercises)
          return {
            week_number: weekNumber,
            exercise_ids: [...new Set([...explicitIds, ...fromExercises])],
          }
        })
        .filter(Boolean)
    : []

  const mappedFromExercises = Array.isArray(program.exercises)
    ? program.exercises.reduce((accumulator, entry) => {
        const exerciseId = toExerciseId(entry?.id ?? entry?.exercise_id ?? entry)
        if (!exerciseId) return accumulator
        const weekNumber = Number(entry?.week_number ?? entry?.week ?? entry?.weekNumber)
        const targetWeek = Number.isFinite(weekNumber) && weekNumber > 0 ? weekNumber : 1
        if (!accumulator[targetWeek]) {
          accumulator[targetWeek] = new Set()
        }
        accumulator[targetWeek].add(exerciseId)
        return accumulator
      }, {})
    : {}

  const mappedFromExercisesList = Object.entries(mappedFromExercises).map(([week, ids]) => ({
    week_number: Number(week),
    exercise_ids: [...ids],
  }))

  const mergedPlan = [...mappedFromWorkoutPlan, ...mappedFromExercisesList]
  if (mergedPlan.length === 0) return []

  const mergedByWeek = mergedPlan.reduce((accumulator, entry) => {
    if (!accumulator[entry.week_number]) {
      accumulator[entry.week_number] = new Set()
    }
    for (const exerciseId of entry.exercise_ids) {
      accumulator[entry.week_number].add(exerciseId)
    }
    return accumulator
  }, {})

  const normalizedPlan = Object.entries(mergedByWeek)
    .map(([week, ids]) => ({
      week_number: Number(week),
      exercise_ids: [...ids],
    }))
    .sort((a, b) => a.week_number - b.week_number)

  const durationWeeks = normalizeDurationWeeks(program.duration_weeks)
  if (durationWeeks > 0) {
    return buildWorkoutPlanForDuration(durationWeeks, normalizedPlan)
  }

  return normalizedPlan
}

const EMPTY_PROGRAM_FORM_VALUES = {
  title: "",
  description: "",
  difficulty: "",
  duration_weeks: "",
  category: "",
  goal: "",
  equipment: [],
  is_public: false,
  workout_plan: [],
}

const buildProgramFormValues = (program) => ({
  title: String(program?.title ?? ""),
  description: String(program?.description ?? ""),
  difficulty: program?.difficulty ?? "",
  duration_weeks:
    program?.duration_weeks === null || program?.duration_weeks === undefined
      ? ""
      : String(program.duration_weeks),
  category: String(program?.category ?? ""),
  goal: String(program?.goal ?? ""),
  equipment: getProgramEquipmentValues(program),
  is_public: Boolean(program?.is_public),
  program_default_image_url: String(program?.image ?? ""),
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

const getStoredUserInfo = () => {
  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    const userData = rawValue ? JSON.parse(rawValue) : null
    return {
      username: String(userData?.username ?? "").trim(),
      userId: userData?.id ?? userData?.user_id ?? userData?.userId ?? null,
    }
  } catch {
    return { username: "", userId: null }
  }
}

const buildRequestConfig = (overrides = {}) => {
  const authToken = getAuthToken()
  return {
    ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
    ...overrides,
  }
}

const normalizeProgramsPayload = (data) => {
  if (Array.isArray(data?.data)) {
    return data.data
  }

  if (Array.isArray(data?.results)) {
    return data.results
  }

  if (Array.isArray(data)) {
    return data
  }

  return []
}

const normalizeProgramDetailPayload = (data) => {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data?.data ?? data?.result ?? data
  }

  return null
}

const normalizeEquipmentPayload = (data) => {
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data)) return data
  return []
}

const normalizeEquipmentChoices = (choices) => {
  if (choices && typeof choices === "object" && !Array.isArray(choices)) {
    return Object.entries(choices)
      .map(([value, label]) => ({ value, label: String(label) }))
      .filter((choice) => choice.value !== "" && choice.value !== null && choice.value !== undefined)
  }

  if (!Array.isArray(choices)) return []

  return choices
    .map((choice) => {
      if (Array.isArray(choice)) {
        const [value, label] = choice
        return { value: value ?? "", label: label ?? String(value ?? "") }
      }

      if (choice && typeof choice === "object") {
        // Use numeric pk/id as the canonical value so payloads send integers.
        // Also capture the original string slug so aliases can be registered.
        const slug = String(choice.value ?? choice.key ?? choice.slug ?? choice.code ?? "").trim()
        const value =
          choice.pk ??
          choice.id ??
          choice.equipment_id ??
          choice.equipmentId ??
          choice.value ??
          choice.key ??
          ""
        const label =
          choice.label ??
          choice.name ??
          choice.display_name ??
          choice.displayName ??
          choice.equipment_name ??
          choice.equipmentName ??
          String(value)
        return { value, label, slug: slug || String(value) }
      }

      return { value: choice, label: String(choice), slug: String(choice) }
    })
    .filter((choice) => choice.value !== "" && choice.value !== null && choice.value !== undefined)
}

const normalizeChoices = (choices) => {
  if (choices && typeof choices === "object" && !Array.isArray(choices)) {
    return Object.entries(choices)
      .map(([value, label]) => ({ value, label: String(label) }))
      .filter((c) => c.value !== "" && c.value !== null && c.value !== undefined)
  }

  if (!Array.isArray(choices)) return []

  return choices
    .map((choice) => {
      if (Array.isArray(choice)) {
        const [value, label] = choice
        return { value: value ?? "", label: label ?? String(value ?? "") }
      }
      if (choice && typeof choice === "object") {
        const value = choice.value ?? choice.id ?? choice.key ?? ""
        const label = choice.label ?? choice.display_name ?? choice.displayName ?? choice.name ?? String(value)
        return { value, label }
      }
      return { value: choice, label: String(choice) }
    })
    .filter((c) => c.value !== "" && c.value !== null && c.value !== undefined)
}

const normalizeSchemaChoices = (fieldConfig) => {
  if (!fieldConfig || typeof fieldConfig !== "object") return []

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
      .map((value, index) => ({ value, label: String(enumLabels[index] ?? value) }))
      .filter((c) => c.value !== "" && c.value !== null && c.value !== undefined)
  }

  const variantChoices = normalizeChoices(
    fieldConfig.oneOf ?? fieldConfig.anyOf ?? fieldConfig.child?.oneOf ?? fieldConfig.child?.anyOf,
  )
  if (variantChoices.length > 0) return variantChoices

  return []
}

const extractChoicesFromFieldConfig = (fieldConfig) => {
  if (!fieldConfig) return []

  const directChoices = normalizeChoices(fieldConfig?.choices)
  if (directChoices.length > 0) return directChoices

  const childChoices = normalizeChoices(fieldConfig?.child?.choices)
  if (childChoices.length > 0) return childChoices

  const schemaChoices = normalizeSchemaChoices(fieldConfig)
  if (schemaChoices.length > 0) return schemaChoices

  return []
}

const getChoicesFromMetadata = (metadata, fieldNames) => {
  if (!metadata || typeof metadata !== "object") return []

  const visited = new Set()
  const queue = [metadata]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== "object" || visited.has(current)) continue
    visited.add(current)

    for (const fieldName of fieldNames) {
      const candidate = current?.[fieldName]
      const normalizedCandidateChoices = normalizeChoices(candidate)
      if (normalizedCandidateChoices.length > 0) return normalizedCandidateChoices
      const extractedCandidateChoices = extractChoicesFromFieldConfig(candidate)
      if (extractedCandidateChoices.length > 0) return extractedCandidateChoices
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value)
    }
  }

  return []
}

const formatTimestamp = (value) => {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString()
}

const getDefaultProgramImageUrl = () => "../src/assets/DefaultBanner.jpg"

const getStoredWorkouts = () => {
  try {
    const rawValue = localStorage.getItem(WORKOUTS_STORAGE_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        ...entry,
        id: String(entry.id || ""),
        title: String(entry.title || ""),
        exercise_ids: Array.isArray(entry.exercise_ids)
          ? entry.exercise_ids.map((exerciseId) => Number(exerciseId)).filter((exerciseId) => Number.isFinite(exerciseId))
          : [],
      }))
      .filter((entry) => entry.id && entry.title && entry.exercise_ids.length > 0)
  } catch {
    return []
  }
}

const getPurchasedProgramIds = () => {
  try {
    const rawValue = localStorage.getItem(PURCHASED_PROGRAMS_STORAGE_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry))
  } catch {
    return []
  }
}

const savePurchasedProgramIds = (programIds) => {
  const normalized = [...new Set((Array.isArray(programIds) ? programIds : [])
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry)))]
  localStorage.setItem(PURCHASED_PROGRAMS_STORAGE_KEY, JSON.stringify(normalized))
}

const savePendingCheckoutProgramId = (programId) => {
  const normalizedProgramId = Number(programId)
  if (!Number.isFinite(normalizedProgramId)) {
    localStorage.removeItem(PENDING_CHECKOUT_PROGRAM_ID_STORAGE_KEY)
    return
  }
  localStorage.setItem(PENDING_CHECKOUT_PROGRAM_ID_STORAGE_KEY, String(normalizedProgramId))
}

const getPendingCheckoutProgramId = () => {
  const rawValue = localStorage.getItem(PENDING_CHECKOUT_PROGRAM_ID_STORAGE_KEY)
  const programId = Number(rawValue)
  return Number.isFinite(programId) ? programId : null
}

const clearPendingCheckoutProgramId = () => {
  localStorage.removeItem(PENDING_CHECKOUT_PROGRAM_ID_STORAGE_KEY)
}

const getStripePublishableKey = () => String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "").trim()

const getProgramCheckoutTitle = (programDetails, programSummary, formValues) =>
  String(
    formValues?.title ||
      programDetails?.title ||
      programDetails?.name ||
      programSummary?.title ||
      programSummary?.name ||
      "Program",
  ).trim()

const parseCheckoutSessionResponse = (responseData) => {
  const payload = responseData?.data ?? responseData
  const checkoutUrl = String(
    payload?.checkout_url ?? payload?.checkoutUrl ?? payload?.url ?? "",
  ).trim()
  const sessionId = String(
    payload?.session_id ?? payload?.sessionId ?? payload?.id ?? "",
  ).trim()

  return { checkoutUrl, sessionId }
}

const buildCheckoutReturnUrl = (type, programId) => {
  const basePath = window.location.origin + window.location.pathname
  console.log("Building checkout return URL with basePath:", basePath, "type:", type, "programId:", programId)
  const query = new URLSearchParams({
    checkout: type,
    programId: String(programId),
  })
  console.log("Constructed query parameters:", query.toString())
  return `${basePath}?${query.toString()}`
}

const getProgramImageUrl = (program) => {
  if (!program || typeof program !== "object") return ""

  return String(
    program?.image ??
      program?.program_image ??
      program?.banner ??
      program?.banner_image ??
      program?.image_url ??
      program?.imageUrl ??
      "",
  ).trim()
}
const normalizeEquipmentEntry = (value) => {
  const normalizeScalar = (entry) => {
    if (entry === null || entry === undefined) return ""
    if (typeof entry === "number" && Number.isFinite(entry)) return entry
    if (typeof entry === "object") return ""

    const trimmed = String(entry).trim()
    if (!trimmed) return ""
    if (/^[+-]?\d+$/.test(trimmed)) return Number(trimmed)
    return trimmed
  }

  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      const firstCandidate = value.find((entry) => entry !== null && entry !== undefined)
      return firstCandidate === undefined ? "" : normalizeEquipmentEntry(firstCandidate)
    }

    const candidate =
      value.value ??
      value.target?.value ??
      value.id ??
      value.pk ??
      value.key ??
      value.slug ??
      value.code ??
      value.equipment_id ??
      value.equipmentId ??
      value.name ??
      value.label ??
      value.equipment_name ??
      value.equipmentName ??
      value.equipment 

    if (candidate === null || candidate === undefined) return ""
    if (typeof candidate === "object") {
      if (Array.isArray(candidate)) {
        const firstCandidate = candidate.find((entry) => entry !== null && entry !== undefined)
        return firstCandidate === undefined ? "" : normalizeEquipmentEntry(firstCandidate)
      }

      const nestedCandidate =
        candidate.value ??
        candidate.id ??
        candidate.pk ??
        candidate.key ??
        candidate.slug ??
        candidate.code ??
        candidate.equipment_id ??
        candidate.equipmentId ??
        candidate.name ??
        candidate.label ??
        candidate.equipment_name ??
        candidate.equipmentName ??
        candidate.equipment

      if (nestedCandidate === null || nestedCandidate === undefined) return ""
      return normalizeScalar(nestedCandidate)
    }
    return normalizeScalar(candidate)
  }

   return normalizeScalar(value)
}

const normalizeEquipmentValues = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeEquipmentEntry(entry))
      .filter(Boolean)
  } 
  if (value && typeof value === "object") {
    const nestedCandidates = [
      value.value,
      value.target?.value,
      value.equipment,
      value.equipments,
      value.equipment_ids,
      value.equipment_values,
      value.equipment_required,
    ]
      .filter((entry) => entry !== undefined && entry !== null)
      .flatMap((entry) => normalizeEquipmentValues(entry))
    if (nestedCandidates.length > 0) {
      return [...new Set(nestedCandidates)]
    }

    const normalizedFromObject = normalizeEquipmentEntry(value)
    return normalizedFromObject ? [normalizedFromObject] : []
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.includes(",")) {
      return trimmed
        .split(",")
        .map((entry) => normalizeEquipmentEntry(entry))
        .filter(Boolean)
    }
    return [normalizeEquipmentEntry(trimmed)].filter(Boolean)
  }

  if (value === null || value === undefined) {
    return []
  }

  const normalizedSingleValue = normalizeEquipmentEntry(value)
  return normalizedSingleValue ? [normalizedSingleValue] : []
}

const getProgramEquipmentValues = (program) => {
  const candidateValues = [
    program?.equipment,
    program?.equipments,
    program?.equipment_ids,
    program?.equipment_values,
    program?.equipment_required,
  ]
  return [...new Set(candidateValues.flatMap((entry) => normalizeEquipmentValues(entry)))]
}

const canonicalizeEquipmentValues = (value, equipmentChoices = []) => {
  const normalized = normalizeEquipmentValues(value)
  if (!Array.isArray(equipmentChoices) || equipmentChoices.length === 0) {
    return [...new Set(normalized)]
  }

  const getAliasKey = (entry) => String(entry).toLowerCase()

  const aliasToCanonical = new Map()
  const allowedValues = new Set()

  const registerAlias = (alias, canonical) => {
    const key = getAliasKey(alias)
    aliasToCanonical.set(key, canonical)
    // Register both underscore and space variants so "body_weight" ↔ "body weight" resolve identically.
    aliasToCanonical.set(key.replace(/_/g, " "), canonical)
    aliasToCanonical.set(key.replace(/\s+/g, "_"), canonical)
  }

  for (const choice of equipmentChoices) {
    const canonicalValue = normalizeEquipmentEntry(choice?.value)
    if (!canonicalValue) continue

    allowedValues.add(canonicalValue)
    aliasToCanonical.set(canonicalValue, canonicalValue)
    registerAlias(String(canonicalValue), canonicalValue)

    const label = normalizeEquipmentEntry(choice?.label)
    if (label) {
      registerAlias(String(label), canonicalValue)
    }

    // Also register the raw string value field from the choice if different from pk/id canonical.
    // Also register the string slug preserved from normalizeEquipmentChoices (e.g. "box", "ski_erg").
    const slugValue = choice?.slug ? normalizeEquipmentEntry(choice.slug) : null
    if (slugValue && slugValue !== canonicalValue) {
      registerAlias(String(slugValue), canonicalValue)
    }
    // Also register any other raw string value field if different from pk/id canonical.
    const rawValue = normalizeEquipmentEntry(choice?.value_str ?? choice?.code ?? "")
    if (rawValue && rawValue !== canonicalValue) {
      registerAlias(String(rawValue), canonicalValue)
    }
  }

  const lookupAlias = (key) => {
    const lower = getAliasKey(key)
    return (
      aliasToCanonical.get(lower) ??
      aliasToCanonical.get(lower.replace(/_/g, " ")) ??
      aliasToCanonical.get(lower.replace(/\s+/g, "_")) ??
      ""
    )
  }

  const mappedValues = normalized
    .map((entry) => {
      const normalizedEntry = normalizeEquipmentEntry(entry)
      return (typeof normalizedEntry === "number"
        ? aliasToCanonical.get(normalizedEntry)
        : undefined) ?? lookupAlias(String(normalizedEntry)) ?? ""
    })
    .filter((entry) => Boolean(entry) && allowedValues.has(entry))

  return [...new Set(mappedValues)]
}

function Programs({ exerciseLibraryState, setExerciseLibraryState, filteredAndSortedLibrary, filters, setFilters, currentPage, setCurrentPage, searchName, sortOrder }) {
  const [programs, setPrograms] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createFormValues, setCreateFormValues] = useState(EMPTY_PROGRAM_FORM_VALUES)
  const [createFieldErrors, setCreateFieldErrors] = useState({})
  const [createErrorMessage, setCreateErrorMessage] = useState("")
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false)
  const [workouts, setWorkouts] = useState(() => getStoredWorkouts())
  const [createPlanWeek, setCreatePlanWeek] = useState(1)
  const [createPlanExercise, setCreatePlanExercise] = useState([])
  const [createPlanWorkoutId, setCreatePlanWorkoutId] = useState("")
  const [selectedProgramId, setSelectedProgramId] = useState(null)
  const [programDetailsById, setProgramDetailsById] = useState({})
  const [programItemRecordsById, setProgramItemRecordsById] = useState({})
  const [detailErrorById, setDetailErrorById] = useState({})
  const [detailLoadingId, setDetailLoadingId] = useState(null)
  const [editFormValues, setEditFormValues] = useState(EMPTY_PROGRAM_FORM_VALUES)
  const [editFieldErrors, setEditFieldErrors] = useState({})
  const [editErrorMessage, setEditErrorMessage] = useState("")
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false)
  const [isDetailsEditMode, setIsDetailsEditMode] = useState(false)
  const [isWorkoutPlanUnlocked, setIsWorkoutPlanUnlocked] = useState(false)
  const [isCheckoutSubmitting, setIsCheckoutSubmitting] = useState(false)
  const [checkoutErrorMessage, setCheckoutErrorMessage] = useState("")
  const [purchasedProgramIds, setPurchasedProgramIds] = useState(() => getPurchasedProgramIds())
  const [editImageFile, setEditImageFile] = useState(null)
  const [editImagePreview, setEditImagePreview] = useState(null)
  const editImageInputRef = useRef(null)
  const [detailWorkoutPlan, setDetailWorkoutPlan] = useState([])
  const [detailPlanWeek, setDetailPlanWeek] = useState(1)
  const [detailPlanExerciseId, setDetailPlanExerciseId] = useState("")
  const [detailPlanWorkoutId, setDetailPlanWorkoutId] = useState("")
  const [categoryChoices, setCategoryChoices] = useState([])
  const [goalChoices, setGoalChoices] = useState([])
  const [difficultyChoices, setDifficultyChoices] = useState([])
  const [equipmentChoices, setEquipmentChoices] = useState([])
  const [durationRange, setDurationRange] = useState({ min: DEFAULT_DURATION_MIN, max: DEFAULT_DURATION_MAX })
  const [isChoicesLoading, setIsChoicesLoading] = useState(false)
  // Schedule-to-calendar state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [scheduleStartDate, setScheduleStartDate] = useState("")
  const [scheduleError, setScheduleError] = useState("")
  const [scheduleSuccess, setScheduleSuccess] = useState("")

  const { exerciseLibrary, 
    isExerciseLibraryLoading, 
    exerciseLibraryError } = exerciseLibraryState

  useEffect(() => {
    const loadPrograms = async () => {
      setIsLoading(true)
      setErrorMessage("")

      try {
        const response = await axios.get(API_URL, buildRequestConfig())
        console.log("Raw programs response:", response)
        setPrograms(normalizeProgramsPayload(response?.data))
      } catch (error) {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          setErrorMessage("Please log in to load training programs.")
        } else {
          const message = error?.response?.data?.detail || "Unable to load programs. Please try again."
          setErrorMessage(message)
        }
        setPrograms([])
      } finally {
        setIsLoading(false)
      }
    }

    loadPrograms()
  }, [])

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const checkoutStatus = query.get("checkout")
    const queryProgramIdRaw = query.get("programId")
    const queryProgramId = queryProgramIdRaw === null ? Number.NaN : Number(queryProgramIdRaw)
    const pendingProgramId = getPendingCheckoutProgramId()
    const resolvedProgramId = Number.isFinite(queryProgramId) ? queryProgramId : pendingProgramId

    if (checkoutStatus === "cancel") {
      setCheckoutErrorMessage("Checkout was canceled. You can try again anytime.")
      clearPendingCheckoutProgramId()
      const nextUrl = `${window.location.origin}${window.location.pathname}`
      window.history.replaceState({}, document.title, nextUrl)
      return
    }
    if (checkoutStatus !== "success") return

    if (!Number.isFinite(resolvedProgramId)) {
      setCheckoutErrorMessage("Checkout completed. Re-open the program details to continue.")
      const nextUrl = `${window.location.origin}${window.location.pathname}`
      window.history.replaceState({}, document.title, nextUrl)
      return
    }

    setPurchasedProgramIds((prev) => {
      const next = [...new Set([...prev, resolvedProgramId])]
      savePurchasedProgramIds(next)
      return next
    })
    clearPendingCheckoutProgramId()

    if (selectedProgramId === resolvedProgramId) {
      setIsWorkoutPlanUnlocked(true)
      setCheckoutErrorMessage("")
    }

    const nextUrl = `${window.location.origin}${window.location.pathname}`
    window.history.replaceState({}, document.title, nextUrl)
  }, [selectedProgramId])

  useEffect(() => {
    const syncWorkoutsFromStorage = () => {
      setWorkouts(getStoredWorkouts())
    }

    syncWorkoutsFromStorage()
    window.addEventListener("storage", syncWorkoutsFromStorage)
    document.addEventListener("visibilitychange", syncWorkoutsFromStorage)

    return () => {
      window.removeEventListener("storage", syncWorkoutsFromStorage)
      document.removeEventListener("visibilitychange", syncWorkoutsFromStorage)
    }
  }, [])

  useEffect(() => {
    const loadChoices = async () => {
      setIsChoicesLoading(true)

      try {
        const cachedRaw = localStorage.getItem(PROGRAMS_CHOICES_CACHE_KEY)
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw)
          const isFresh = Date.now() - (parsed?.cachedAt || 0) < CHOICES_CACHE_TTL_MS
          if (
            isFresh &&
            (parsed?.categoryChoices?.length ||
              parsed?.goalChoices?.length ||
              parsed?.difficultyChoices?.length ||
              parsed?.equipmentChoices?.length)
          ) {
            setCategoryChoices(parsed.categoryChoices || [])
            setGoalChoices(parsed.goalChoices || [])
            setDifficultyChoices(parsed.difficultyChoices || [])
            setEquipmentChoices(parsed.equipmentChoices || [])
            if (parsed?.durationRange?.min && parsed?.durationRange?.max) {
              setDurationRange(parsed.durationRange)
            }
          }
        }
      } catch {
        localStorage.removeItem(PROGRAMS_CHOICES_CACHE_KEY)
      }

      try {
        const requestConfig = buildRequestConfig()
        const [choicesResult, equipmentResult] = await Promise.allSettled([
          axios.get(`${API_URL}choices/`, requestConfig),
          axios.get(EQUIPMENT_API_URL, requestConfig),
        ])
    
        const data = choicesResult.status === "fulfilled" ? choicesResult.value?.data ?? {} : {}
        const equipmentData = equipmentResult.status === "fulfilled" ? equipmentResult.value?.data : null
        const directCategoryChoices = normalizeChoices(data.category ?? data.categories ?? [])
        const directGoalChoices = normalizeChoices(data.goal ?? data.goals ?? [])
        const directDifficultyChoices = normalizeChoices(data.difficulty ?? data.difficulties ?? [])
        const directEquipmentChoices = normalizeEquipmentChoices(data.equipment ?? data.equipments ?? [])
        const equipmentChoicesFromEndpoint = normalizeEquipmentChoices(normalizeEquipmentPayload(equipmentData))

        const category =
          directCategoryChoices.length > 0 ? directCategoryChoices : getChoicesFromMetadata(data, ["category", "categories"])
        const goal = directGoalChoices.length > 0 ? directGoalChoices : getChoicesFromMetadata(data, ["goal", "goals"])
        const difficulty =
          directDifficultyChoices.length > 0
            ? directDifficultyChoices
            : getChoicesFromMetadata(data, ["difficulty", "difficulties"])
        const equipment =
          equipmentChoicesFromEndpoint.length > 0
            ? equipmentChoicesFromEndpoint
            : directEquipmentChoices.length > 0
            ? directEquipmentChoices
            : getChoicesFromMetadata(data, ["equipment", "equipments"])
        const durationConfig =
          data.duration_weeks ??
          data.durationWeeks ??
          data.fields?.duration_weeks ??
          data.properties?.duration_weeks ??
          {}

        const minDurationCandidate = Number(
          durationConfig.min ?? durationConfig.minimum ?? durationConfig.min_value ?? durationConfig.minValue,
        )
        const maxDurationCandidate = Number(
          durationConfig.max ?? durationConfig.maximum ?? durationConfig.max_value ?? durationConfig.maxValue,
        )

        const minDuration = Number.isFinite(minDurationCandidate) ? minDurationCandidate : DEFAULT_DURATION_MIN
        const maxDuration = Number.isFinite(maxDurationCandidate) ? maxDurationCandidate : DEFAULT_DURATION_MAX
        const nextDurationRange =
          maxDuration >= minDuration
            ? { min: minDuration, max: maxDuration }
            : { min: DEFAULT_DURATION_MIN, max: DEFAULT_DURATION_MAX }

        setCategoryChoices(category)
        setGoalChoices(goal)
        setDifficultyChoices(difficulty)
        setEquipmentChoices(equipment)
        setDurationRange(nextDurationRange)
        localStorage.setItem(
          PROGRAMS_CHOICES_CACHE_KEY,
          JSON.stringify({
            categoryChoices: category,
            goalChoices: goal,
            difficultyChoices: difficulty,
            equipmentChoices: equipment,
            durationRange: nextDurationRange,
            cachedAt: Date.now(),
          }),
        )
      } catch {
        // Non-critical — filters will still work from loaded program data.
      } finally {
        setIsChoicesLoading(false)
      }
    }

    loadChoices()
  }, [])

  

  const selectedProgram = useMemo(
    () => {
      const found = programs.find((program) => program.id === selectedProgramId)
      if (found) return found
      const backendDefault = programs.find((program) => program.is_default === true)
      return backendDefault ?? null
    }, [programs, selectedProgramId])

  useEffect(() => {
    if (!selectedProgramId) return
    if (isDetailsEditMode) return
    const sourceProgram = programDetailsById[selectedProgramId] ?? selectedProgram
    if (!sourceProgram) return
    setEditFormValues({
      ...buildProgramFormValues(sourceProgram),
      equipment: canonicalizeEquipmentValues(getProgramEquipmentValues(sourceProgram), equipmentChoices),
    })
    setEditImagePreview(getProgramImageUrl(sourceProgram))
  }, [selectedProgramId, programDetailsById, selectedProgram, isDetailsEditMode, equipmentChoices])

  const difficulties = useMemo(() => {
    if (difficultyChoices.length > 0) {
      return difficultyChoices.map((c) => ({ value: c.value, label: c.label || c.value }))
    }
    const fromPrograms = programs.map((p) => p?.difficulty).filter(Boolean)
    return [...new Set([...DEFAULT_DIFFICULTIES, ...fromPrograms])].map((v) => ({ value: v, label: v }))
  }, [programs, difficultyChoices])

  const categories = useMemo(() => {
    if (categoryChoices.length > 0) {
      const seen = new Map()
      for (const c of categoryChoices) {
        if (!seen.has(c.value)) seen.set(c.value, c)
      }
      return [...seen.values()].sort((a, b) => String(a.value).localeCompare(String(b.value)))
    }
    const fromPrograms = programs.map((p) => p?.category).filter(Boolean)
    return [...new Set(fromPrograms)].sort().map((v) => ({ value: v, label: v }))
  }, [programs, categoryChoices])
  const categoryFilterOptions = categories

  const goals = useMemo(() => {
    if (goalChoices.length > 0) {
      const seen = new Map()
      for (const c of goalChoices) {
        if (!seen.has(c.value)) seen.set(c.value, c)
      }
      return [...seen.values()].sort((a, b) => String(a.value).localeCompare(String(b.value)))
    }
    const fromPrograms = programs.map((p) => p?.goal).filter(Boolean)
    return [...new Set(fromPrograms)].sort().map((v) => ({ value: v, label: v }))
  }, [programs, goalChoices])
  const goalFilterOptions = goals

  const equipments = useMemo(() => {
    if (equipmentChoices.length > 0) {
      return equipmentChoices
        .map((c) => ({
          value: c.slug || String(c.value),
          label: String(c.label || c.slug || c.value),
        }))
        .filter((entry) => Boolean(entry.value))
    }
    const fromPrograms = programs.flatMap((p) => normalizeEquipmentValues(p?.equipment))
    return [...new Set(fromPrograms)].sort().map((v) => ({ value: v, label: v }))
  }, [programs, equipmentChoices])


  const workoutPlan = Array.isArray(createFormValues.workout_plan) ? createFormValues.workout_plan : []
  const exerciseOptions = useMemo(() => {
    return [...exerciseLibrary]
      .filter((exercise) => Number.isFinite(Number(exercise?.id)))
      .sort((a, b) => String(a?.title ?? a?.name ?? "").localeCompare(String(b?.title ?? b?.name ?? "")))
  }, [exerciseLibrary])
  const exerciseNameById = useMemo(
    () =>
      exerciseOptions.reduce((accumulator, exercise) => {
        accumulator[Number(exercise.id)] = String(exercise.title || exercise.name || `Exercise #${exercise.id}`)
        return accumulator
      }, {}),
    [exerciseOptions],
  )
  const workoutById = useMemo(
    () => new Map(workouts.map((workout) => [String(workout.id), workout])),
    [workouts],
  )
  const detailsWorkoutPlan = Array.isArray(detailWorkoutPlan) ? detailWorkoutPlan : []
  const createEquipmentSelection = Array.isArray(createFormValues.equipment) ? createFormValues.equipment : []
  const editEquipmentSelection = Array.isArray(editFormValues.equipment) ? editFormValues.equipment : []
  const createEquipmentValues = normalizeEquipmentValues(createFormValues.equipment)
  const editEquipmentValues = normalizeEquipmentValues(editFormValues.equipment)
  const filterCategoryValues = Array.isArray(filters.category) ? filters.category : []
  const filterGoalValues = Array.isArray(filters.goal) ? filters.goal : []
  const filterEquipmentValues = Array.isArray(filters.equipment) ? filters.equipment : []

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedLibrary.length / PROGRAMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedPrograms = filteredAndSortedLibrary.slice(
    (safePage - 1) * PROGRAMS_PER_PAGE,
    safePage * PROGRAMS_PER_PAGE,
  )
  const selectedProgramDetails = selectedProgramId ? programDetailsById[selectedProgramId] : null
  const selectedProgramOwner =
    selectedProgramDetails?.created_by_username ||
    selectedProgramDetails?.username ||
    selectedProgramDetails?.created_by ||
    selectedProgram?.created_by_username ||
    selectedProgram?.username ||
    selectedProgram?.created_by ||
    ""
  const { username: currentUsername, userId: currentUserId } = getStoredUserInfo()
  const selectedProgramOwnerId =
    selectedProgramDetails?.created_by_id ??
    selectedProgramDetails?.created_by_user_id ??
    selectedProgram?.created_by_id ??
    selectedProgram?.created_by_user_id ??
    null
  const ownerMissing = !selectedProgramOwner && (selectedProgramOwnerId === null || selectedProgramOwnerId === undefined)
  const ownerMatchesByUsername =
    Boolean(currentUsername) &&
    Boolean(selectedProgramOwner) &&
    String(currentUsername).toLowerCase() === String(selectedProgramOwner).toLowerCase()
  const ownerMatchesById =
    currentUserId !== null &&
    currentUserId !== undefined &&
    selectedProgramOwnerId !== null &&
    selectedProgramOwnerId !== undefined &&
    String(currentUserId) === String(selectedProgramOwnerId)
  const canEditSelectedProgram = Boolean(selectedProgramId && currentUsername && (ownerMissing || ownerMatchesByUsername || ownerMatchesById))
  const createProgramImageUrl = editImagePreview || getDefaultProgramImageUrl()
  const selectedProgramImageUrl = getProgramImageUrl(selectedProgramDetails) || getProgramImageUrl(selectedProgram) || editImagePreview || getDefaultProgramImageUrl()

  const handleSearchChange = (event) => {
    setSearchName(event.target.value)
    setCurrentPage(1)
  }

  const handleSortChange = (event) => {
    setSortOrder(event.target.value)
    setCurrentPage(1)
  }

  const handleClearFilters = () => {
    setSearchName("")
    setSortOrder("asc")
    setFilters({ difficulty: [], category: [], goal: [], equipment: [] })
    setCurrentPage(1)
  }

  const handleOpenCreateModal = () => {
    setCreateFormValues(EMPTY_PROGRAM_FORM_VALUES)
    setCreateFieldErrors({})
    setCreateErrorMessage("")
    setCreatePlanWeek(1)
    setCreatePlanExercise([])
    setCreatePlanWorkoutId("")
    setEditImageFile(null)
    setEditImagePreview("")
    if (editImageInputRef.current) {
      editImageInputRef.current.value = ""
    }
    setIsCreateModalOpen(true)
  }


  const handleCloseCreateModal = () => {
    setEditImageFile(null)
    setEditImagePreview("")
    if (editImageInputRef.current) {
      editImageInputRef.current.value = ""
    }
    setIsCreateModalOpen(false)
  }

  const handleCreateFieldChange = (event) => {
    const { name, type, checked, value } = event.target
    const nextValue = type === "checkbox" ? checked : value

    setCreateFormValues((prev) => {
      const nextFormValues = { ...prev, [name]: nextValue }
      console.log(`Updated create form field "${name}" to value:`, nextValue)
      if (name === "duration_weeks") {
        nextFormValues.workout_plan = buildWorkoutPlanForDuration(nextValue, prev.workout_plan)
      }
      return nextFormValues
    })
    setCreateFieldErrors((prev) => clearFormFieldError(prev, name, name === "duration_weeks"))
  }

  const handleAddWorkoutToPlanWeek = (weekNumber, selectedExerciseIds) => {
    // TODO: Refactor exercise-list in excise component -- create a 
    // reusable function maybe in its own function  also for programs 
    // exercise list. see Line 964 in Exercises component.
    setCreateFormValues((prev) => {
      const nextPlan = buildWorkoutPlanForDuration(prev.duration_weeks, prev.workout_plan).map((weekEntry) => {
        if (weekEntry.week_number !== weekNumber) return weekEntry
        const nextExerciseIds = [...new Set([...weekEntry.exercise_ids, ...selectedExerciseIds])]
        if (nextExerciseIds.length === weekEntry.exercise_ids.length) return weekEntry
        return {
          ...weekEntry,
          exercise_ids: nextExerciseIds,
        }
      })
      return { ...prev, workout_plan: nextPlan }
    })
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
    setCreatePlanExercise([])
  }

  const handleAddSavedWorkoutToCreateWeek = () => {
    const weekNumber = Number(createPlanWeek)
    const selectedWorkout = workoutById.get(String(createPlanWorkoutId))
    const workoutExerciseIds = Array.isArray(selectedWorkout?.exercise_ids)
      ? selectedWorkout.exercise_ids.map((exerciseId) => Number(exerciseId)).filter((exerciseId) => Number.isFinite(exerciseId))
      : []
    if (!Number.isFinite(weekNumber) || workoutExerciseIds.length === 0) return

    setCreateFormValues((prev) => {
      const nextPlan = buildWorkoutPlanForDuration(prev.duration_weeks, prev.workout_plan).map((weekEntry) => {
        if (weekEntry.week_number !== weekNumber) return weekEntry
        return {
          ...weekEntry,
          exercise_ids: [...new Set([...weekEntry.exercise_ids, ...workoutExerciseIds])],
        }
      })
      return { ...prev, workout_plan: nextPlan }
    })
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
    setCreatePlanWorkoutId("")
  }

  const handleRemoveExerciseFromWorkoutWeek = (weekNumber, exerciseId) => {
    setCreateFormValues((prev) => {
      const nextPlan = buildWorkoutPlanForDuration(prev.duration_weeks, prev.workout_plan).map((weekEntry) => {
        if (weekEntry.week_number !== weekNumber) return weekEntry
        return {
          ...weekEntry,
          exercise_ids: weekEntry.exercise_ids.filter((candidateId) => candidateId !== exerciseId),
        }
      })
      return { ...prev, workout_plan: nextPlan }
    })
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
  }

  const validateCreateForm = () => {
    const nextErrors = {}

    if (!createFormValues.title.trim()) {
      nextErrors.title = "Program title is required."
    }
    if (!createFormValues.description.trim()) {
      nextErrors.description = "Description is required."
    }
    if (!createFormValues.difficulty) {
      nextErrors.difficulty = "Difficulty is required."
    }
    if (!createFormValues.category.trim()) {
      nextErrors.category = "Category is required."
    }
    if (!createFormValues.goal.trim()) {
      nextErrors.goal = "Goal is required."
    }
    if (!Array.isArray(createFormValues.equipment) || createFormValues.equipment.length === 0) {
      nextErrors.equipment = "Equipment is required."
    }

    const durationValue = Number(createFormValues.duration_weeks)
    if (!Number.isFinite(durationValue) || durationValue < durationRange.min || durationValue > durationRange.max) {
      nextErrors.duration_weeks = `Duration must be between ${durationRange.min} and ${durationRange.max} weeks.`
    }

    const workoutPlanError = getWorkoutPlanValidationMessage(durationValue, createFormValues.workout_plan)
    if (workoutPlanError) {
      nextErrors.workout_plan = workoutPlanError
    }

    return nextErrors
  }

  const handleCreateProgram = async (event) => {
    event.preventDefault()
    setCreateErrorMessage("")

    const nextErrors = validateCreateForm()
    if (Object.keys(nextErrors).length > 0) {
      setCreateFieldErrors(nextErrors)
      return
    }

    setIsCreateSubmitting(true)
    try {
      const normalizedWorkoutPlan = buildWorkoutPlanForDuration(createFormValues.duration_weeks, workoutPlan)
      console.log("Normalized workout plan for submission:", normalizedWorkoutPlan)
      const selectedExerciseIds = [...new Set(normalizedWorkoutPlan.flatMap((weekEntry) => weekEntry.exercise_ids || []))]
      console.log("Selected exercise IDs for submission:", selectedExerciseIds) 
      const payload = {
        title: createFormValues.title.trim(),
        description: createFormValues.description.trim(),
        difficulty: createFormValues.difficulty,
        duration_weeks: Number(createFormValues.duration_weeks),
        category: createFormValues.category.trim(),
        goal: createFormValues.goal.trim(),
        equipment: canonicalizeEquipmentValues(createFormValues.equipment, equipmentChoices),
        is_public: Boolean(createFormValues.is_public),
        exercises: selectedExerciseIds,
        workout_plan: normalizedWorkoutPlan,
        program_image: createFormValues.program_image,
      }
      const response = await axios.post(API_URL, payload, buildRequestConfig())
      
      const createdProgram = normalizeProgramDetailPayload(response?.data)
      if (createdProgram?.id) {
        const itemsPayload = buildProgramItemsFromWorkoutPlan(normalizedWorkoutPlan)
        if (itemsPayload.length > 0) {
          try {
            await syncProgramItems(createdProgram.id, itemsPayload, false)
          } catch {
            // Do not block program creation when item sync fails.
          }
        }
      }
      const createdProgramWithPlan = createdProgram
        ? {
            ...createdProgram,
            workout_plan:
              Array.isArray(createdProgram.workout_plan) && createdProgram.workout_plan.length > 0
                ? createdProgram.workout_plan
                : normalizedWorkoutPlan,
            exercises:
              Array.isArray(createdProgram.exercises) && createdProgram.exercises.length > 0
                ? createdProgram.exercises
                : selectedExerciseIds,
            equipment:
              canonicalizeEquipmentValues(getProgramEquipmentValues(createdProgram), equipmentChoices).length > 0
                ? canonicalizeEquipmentValues(getProgramEquipmentValues(createdProgram), equipmentChoices)
                : payload.equipment,
          }
        : null

      if (createdProgramWithPlan && createdProgramWithPlan.id) {
        setPrograms((prev) => [createdProgramWithPlan, ...prev])
      }

      setIsCreateModalOpen(false)
      setCreateFormValues(EMPTY_PROGRAM_FORM_VALUES)
      setCreateFieldErrors({})
      setCreatePlanWeek(1)
      setCreatePlanExercise([])
      setCreatePlanWorkoutId("")
    } catch (error) {
      const fieldErrors = {}
      const responseData = error?.response?.data
      if (responseData && typeof responseData === "object") {
        const knownFields = [
          "title",
          "description",
          "difficulty",
          "duration_weeks",
          "category",
          "goal",
          "equipment",
          "is_public",
        ]
        for (const fieldName of knownFields) {
          const rawValue = responseData[fieldName]
          if (!rawValue) {
            continue
          }
          fieldErrors[fieldName] = Array.isArray(rawValue) ? rawValue.join(" ") : String(rawValue)
        }
      }

      setCreateFieldErrors(fieldErrors)
      setCreateErrorMessage(error?.response?.data?.detail || "Unable to create program. Please review your inputs.")
    } finally {
      setIsCreateSubmitting(false)
    }
  }

  const handleCloseDetailsModal = () => {
    setSelectedProgramId(null)
    setEditFieldErrors({})
    setEditErrorMessage("")
    setCheckoutErrorMessage("")
    setIsEditSubmitting(false)
    setIsDeleteSubmitting(false)
    setIsDetailsEditMode(false)
    setIsWorkoutPlanUnlocked(false)
    setDetailWorkoutPlan([])
    setDetailPlanWeek(1)
    setDetailPlanExerciseId("")
    setDetailPlanWorkoutId("")
    setEditImageFile(null)
    setEditImagePreview("")
    if (editImageInputRef.current) {
      editImageInputRef.current.value = ""
    }
  }

  const validateEditForm = () => {
    const nextErrors = {}

    if (!editFormValues.title.trim()) {
      nextErrors.title = "Program title is required."
    }
    if (!editFormValues.description.trim()) {
      nextErrors.description = "Description is required."
    }
    if (!editFormValues.difficulty) {
      nextErrors.difficulty = "Difficulty is required."
    }
    if (!editFormValues.category.trim()) {
      nextErrors.category = "Category is required."
    }
    if (!editFormValues.goal.trim()) {
      nextErrors.goal = "Goal is required."
    }
    if (!Array.isArray(editFormValues.equipment) || editFormValues.equipment.length === 0) {
      nextErrors.equipment = "Equipment is required."
    }

    const durationValue = Number(editFormValues.duration_weeks)
    if (!Number.isFinite(durationValue) || durationValue < durationRange.min || durationValue > durationRange.max) {
      nextErrors.duration_weeks = `Duration must be between ${durationRange.min} and ${durationRange.max} weeks.`
    }

    const workoutPlanError = getWorkoutPlanValidationMessage(durationValue, detailWorkoutPlan)
    if (workoutPlanError) {
      nextErrors.workout_plan = workoutPlanError
    }

    return nextErrors
  }

  const handleEditFieldChange = (event) => {
    if (!isDetailsEditMode) return

    const { name, type, checked, value } = event.target
    const nextValue = type === "checkbox" ? checked : value
    setEditFormValues((prev) => ({ ...prev, [name]: nextValue }))
    if (name === "duration_weeks") {
      setDetailWorkoutPlan((prev) => buildWorkoutPlanForDuration(nextValue, prev))
      setDetailPlanWeek(1)
      setDetailPlanExerciseId("")
    }
    setEditFieldErrors((prev) => clearFormFieldError(prev, name, name === "duration_weeks"))
  }

  const handleEditImageChange = (event) => {
    const file = event.target.files?.[0] ?? null
    console.log("[Programs] handleEditImageChange", {
      hasFile: Boolean(file),
      fileName: file?.name,
      fileType: file?.type,
      fileSize: file?.size,
    })
    setEditImageFile(file)
    if (file) {
      const objectUrl = URL.createObjectURL(file)
      setEditImagePreview((prev) => {
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev)
        return objectUrl
      })
    }
  }

  const handleStartEditProgram = () => {
    if (!selectedProgramId || !canEditSelectedProgram) return

    const sourceProgram = programDetailsById[selectedProgramId] ?? selectedProgram
    if (sourceProgram) {
      setEditFormValues({
        ...buildProgramFormValues(sourceProgram),
        equipment: canonicalizeEquipmentValues(getProgramEquipmentValues(sourceProgram), equipmentChoices),
      })
      const nextWorkoutPlan = buildWorkoutPlanFromProgram(sourceProgram)
      setDetailWorkoutPlan(nextWorkoutPlan)
      setDetailPlanWeek(nextWorkoutPlan[0]?.week_number || 1)
      setDetailPlanWorkoutId("")
      setEditImageFile(null)
      setEditImagePreview(getProgramImageUrl(sourceProgram))
      if (editImageInputRef.current) {
        editImageInputRef.current.value = ""
      }
    }
    setEditFieldErrors({})
    setEditErrorMessage("")
    setIsDetailsEditMode(true)
  }

  const handleViewDetails = async (programId) => {
    setSelectedProgramId(programId)
    setIsDetailsEditMode(false)
    setIsWorkoutPlanUnlocked(purchasedProgramIds.includes(Number(programId)))
    setDetailWorkoutPlan([])
    setDetailPlanWeek(1)
    setDetailPlanExerciseId("")
    setDetailPlanWorkoutId("")
    setEditFieldErrors({})
    setEditErrorMessage("")
    setCheckoutErrorMessage("")
    const sourceProgramFromList = programs.find((program) => program.id === programId) ?? null
    const cachedDetail = programDetailsById[programId]

    if (cachedDetail) {
      if (!Array.isArray(programItemRecordsById[programId])) {
        try {
          const itemsResponse = await axios.get(buildProgramItemsApiUrl(programId), buildRequestConfig())
          const itemRecords = normalizeProgramItemsPayload(itemsResponse?.data)
          setProgramItemRecordsById((prev) => ({ ...prev, [programId]: itemRecords }))
          const itemsPlan = buildWorkoutPlanFromProgramItems(itemRecords, cachedDetail?.duration_weeks)
          if (itemsPlan.length > 0) {
            setProgramDetailsById((prev) => ({
              ...prev,
              [programId]: {
                ...prev[programId],
                workout_plan: itemsPlan,
                exercises: [...new Set(itemsPlan.flatMap((weekEntry) => weekEntry.exercise_ids || []))],
              },
            }))
          }
        } catch {
          setProgramItemRecordsById((prev) => ({ ...prev, [programId]: [] }))
        }
      }
      return
    }

    setDetailLoadingId(programId)
    setDetailErrorById((prev) => ({ ...prev, [programId]: "" }))

    try {
      const [detailResponse, itemsResponse] = await Promise.all([
        axios.get(`${API_URL}${programId}/`, buildRequestConfig()),
        axios.get(buildProgramItemsApiUrl(programId), buildRequestConfig()).catch(() => null),
      ])
      console.log("[Programs] Loaded program detail and items", {
        detailResponse,
        itemsResponse,
      })
      const detail = normalizeProgramDetailPayload(detailResponse?.data)
      if (!detail) {
        throw new Error("No detail payload")
      }
      const itemRecords = normalizeProgramItemsPayload(itemsResponse?.data)
      setProgramItemRecordsById((prev) => ({ ...prev, [programId]: itemRecords }))
      const itemsPlan = buildWorkoutPlanFromProgramItems(itemRecords, detail?.duration_weeks)
      const detailHasPlan = buildWorkoutPlanFromProgram(detail).length > 0
      const sourceHasPlan = buildWorkoutPlanFromProgram(sourceProgramFromList).length > 0
      const mergedDetail = {
        ...detail,
        equipment:
          canonicalizeEquipmentValues(getProgramEquipmentValues(detail), equipmentChoices).length > 0
            ? canonicalizeEquipmentValues(getProgramEquipmentValues(detail), equipmentChoices)
            : canonicalizeEquipmentValues(getProgramEquipmentValues(sourceProgramFromList), equipmentChoices),
        ...(itemsPlan.length > 0
          ? {
              workout_plan: itemsPlan,
              exercises: [...new Set(itemsPlan.flatMap((weekEntry) => weekEntry.exercise_ids || []))],
            }
          : !detailHasPlan && sourceHasPlan
            ? {
                workout_plan: sourceProgramFromList?.workout_plan ?? detail.workout_plan,
                exercises: sourceProgramFromList?.exercises ?? detail.exercises,
              }
            : {}),
      }
      setProgramDetailsById((prev) => ({ ...prev, [programId]: mergedDetail }))
    } catch (error) {
      const message = error?.response?.data?.detail || "Unable to load program details."
      setDetailErrorById((prev) => ({ ...prev, [programId]: message }))
    } finally {
      setDetailLoadingId(null)
    }
  }

  const handleUpdateProgram = async (event) => {
    event.preventDefault()
    console.log("[Programs] handleUpdateProgram start", {
      selectedProgramId,
      isDetailsEditMode,
      canEditSelectedProgram,
    })
    if (!selectedProgramId) return

    setEditErrorMessage("")
    const nextErrors = validateEditForm()
    if (Object.keys(nextErrors).length > 0) {
      console.warn("[Programs] Edit validation blocked submit", nextErrors)
      setEditFieldErrors(nextErrors)
      return
    }

    setIsEditSubmitting(true)
    try {
      const normalizedDetailWorkoutPlan = buildWorkoutPlanForDuration(editFormValues.duration_weeks, detailsWorkoutPlan)
      const selectedExerciseIds = [...new Set(normalizedDetailWorkoutPlan.flatMap((weekEntry) => weekEntry.exercise_ids || []))]
      const currentProgram = programDetailsById[selectedProgramId] ?? selectedProgram
      let existingItemRecords = programItemRecordsById[selectedProgramId]
      if (!Array.isArray(existingItemRecords)) {
        try {
          const itemsResponse = await axios.get(buildProgramItemsApiUrl(selectedProgramId), buildRequestConfig())
          existingItemRecords = normalizeProgramItemsPayload(itemsResponse?.data)
          setProgramItemRecordsById((prev) => ({ ...prev, [selectedProgramId]: existingItemRecords }))
        } catch {
          existingItemRecords = []
        }
      }
      const existingWorkoutPlan = buildWorkoutPlanFromProgram(currentProgram)
      const payload = {
        title: editFormValues.title.trim(),
        description: editFormValues.description.trim(),
        difficulty: editFormValues.difficulty,
        duration_weeks: Number(editFormValues.duration_weeks),
        category: editFormValues.category.trim(),
        goal: editFormValues.goal.trim(),
        equipment: canonicalizeEquipmentValues(editFormValues.equipment, equipmentChoices),
        is_public: Boolean(editFormValues.is_public),
        exercises: selectedExerciseIds,
        workout_plan: normalizedDetailWorkoutPlan,
        program_image: editFormValues.program_image,
      }
      const response = await axios.put(`${API_URL}${selectedProgramId}/`, payload, buildRequestConfig())
      if (!areWorkoutPlansEqual(normalizedDetailWorkoutPlan, existingWorkoutPlan)) {
        const itemsPayload = buildProgramItemsFromWorkoutPlan(normalizedDetailWorkoutPlan)
        try {
          const syncedItems = await syncProgramItemsByItemUrl(selectedProgramId, existingItemRecords, itemsPayload)
          if (Array.isArray(syncedItems)) {
            setProgramItemRecordsById((prev) => ({ ...prev, [selectedProgramId]: syncedItems }))
          }
        } catch {
          // Keep program update success even if item sync fails.
        }
      }
      const pendingImageFile = editImageInputRef.current?.files?.[0] ?? editImageFile
      console.log("[Programs] pendingImageFile check", {
        hasPendingImageFile: Boolean(pendingImageFile),
        fromInputRef: Boolean(editImageInputRef.current?.files?.[0]),
        fromState: Boolean(editImageFile),
        pendingFileName: pendingImageFile?.name,
      })
      if (pendingImageFile) {
        const authToken = getAuthToken()
        const imageRequestConfig = authToken
          ? { headers: { Authorization: `Bearer ${authToken}` } }
          : {}
        try {
          const imageUploadUrl = `${API_URL}${selectedProgramId}/`
          const imageFormData = new FormData()
          imageFormData.append("program_image", pendingImageFile)
          console.log("[Programs] Uploading banner image", {
            url: imageUploadUrl,
            programId: selectedProgramId,
            fileName: pendingImageFile?.name,
            fileType: pendingImageFile?.type,
            fileSize: pendingImageFile?.size,
            fieldName: "program_image",
          })
          let imageUploadResponse
          try {
            imageUploadResponse = await axios.patch(imageUploadUrl, imageFormData, imageRequestConfig)
          } catch (primaryUploadError) {
            const fallbackFormData = new FormData()
            fallbackFormData.append("image", pendingImageFile)
            console.warn("[Programs] program_image upload failed, retrying with image field", {
              status: primaryUploadError?.response?.status,
              data: primaryUploadError?.response?.data,
            })
            imageUploadResponse = await axios.patch(imageUploadUrl, fallbackFormData, imageRequestConfig)
          }
          
          // Immediately update the cache with the image URL from the PATCH response
          // so the banner shows correctly when the details modal is re-opened.
          const patchedDetail = normalizeProgramDetailPayload(imageUploadResponse?.data)
          const resolvedImageUrl = getProgramImageUrl(patchedDetail)
          console.log("[Programs] Resolved image URL from PATCH response", { resolvedImageUrl, patchedDetail })
          if (resolvedImageUrl) {
            setProgramDetailsById((prev) => ({
              ...prev,
              [selectedProgramId]: {
                ...prev[selectedProgramId],
                program_image: resolvedImageUrl,
              },
            }))
            setPrograms((prev) =>
              prev.map((p) =>
                p.id === selectedProgramId ? { ...p, program_image: resolvedImageUrl } : p,
              ),
            )
          }
        } catch (imageError) {
          console.error("[Programs] Banner upload failed", {
            status: imageError?.response?.status,
            data: imageError?.response?.data,
            message: imageError?.message,
          })
          const imageErrorMessage =
            imageError?.response?.data?.program_image?.[0] ||
            imageError?.response?.data?.image?.[0] ||
            imageError?.response?.data?.detail ||
            "Image upload failed. Other changes were saved."
          setEditErrorMessage(imageErrorMessage)
          setIsEditSubmitting(false)
          return
        }
      } else {
        console.warn("[Programs] No image file detected at save time; skipping image PATCH")
      }
      let updatedProgram = normalizeProgramDetailPayload(response?.data) ?? payload
      // Re-fetch the updated program to keep cards/details in sync with backend-normalized data.
      try {
        const refreshedDetailResponse = await axios.get(`${API_URL}${selectedProgramId}/`, buildRequestConfig())
        const refreshedDetail = normalizeProgramDetailPayload(refreshedDetailResponse?.data)
        if (refreshedDetail) {
          updatedProgram = refreshedDetail
        }
      } catch {
        // Keep update success even if the post-save refresh fails.
      }
      setPrograms((prev) =>
        prev.map((program) =>
          program.id === selectedProgramId
            ? {
                ...program,
                ...updatedProgram,

                equipment:
                  canonicalizeEquipmentValues(getProgramEquipmentValues(updatedProgram), equipmentChoices).length > 0
                    ? canonicalizeEquipmentValues(getProgramEquipmentValues(updatedProgram), equipmentChoices)
                    : payload.equipment,
              }
            : program,
        ),
      )
      setProgramDetailsById((prev) => ({
        ...prev,
        [selectedProgramId]: {
          ...prev[selectedProgramId],
          ...updatedProgram,
          workout_plan: normalizedDetailWorkoutPlan,
          exercises: selectedExerciseIds,
          equipment:
            canonicalizeEquipmentValues(getProgramEquipmentValues(updatedProgram), equipmentChoices).length > 0
              ? canonicalizeEquipmentValues(getProgramEquipmentValues(updatedProgram), equipmentChoices)
              : payload.equipment,
        },
      }))
      handleCloseDetailsModal()
    } catch (error) {
      const fieldErrors = {}
      const responseData = error?.response?.data
      if (responseData && typeof responseData === "object") {
        const knownFields = [
          "title",
          "description",
          "difficulty",
          "duration_weeks",
          "category",
          "goal",
          "equipment",
          "is_public",
        ]
        for (const fieldName of knownFields) {
          const rawValue = responseData[fieldName]
          if (!rawValue) continue
          fieldErrors[fieldName] = Array.isArray(rawValue) ? rawValue.join(" ") : String(rawValue)
        }
      }
      setEditFieldErrors(fieldErrors)
      setEditErrorMessage(error?.response?.data?.detail || "Unable to update program. Please review your inputs.")
    } finally {
      setIsEditSubmitting(false)
    }
  }

  const handleDeleteProgram = async () => {
    if (!selectedProgramId) return

    setEditErrorMessage("")
    setIsDeleteSubmitting(true)
    try {
      await axios.delete(`${API_URL}${selectedProgramId}/`, buildRequestConfig())
      setPrograms((prev) => prev.filter((program) => program.id !== selectedProgramId))
      setProgramDetailsById((prev) => {
        const next = { ...prev }
        delete next[selectedProgramId]
        return next
      })
      setProgramItemRecordsById((prev) => {
        const next = { ...prev }
        delete next[selectedProgramId]
        return next
      })
      handleCloseDetailsModal()
    } catch (error) {
      setEditErrorMessage(error?.response?.data?.detail || "Unable to delete program. Please try again.")
    } finally {
      setIsDeleteSubmitting(false)
    }
  }

  const handleBuyProgram = async () => {
    if (!selectedProgramId) return

    setCheckoutErrorMessage("")
    console.log("[Programs] handleBuyProgram start", { selectedProgramId, selectedProgramDetails, selectedProgram })
    setIsCheckoutSubmitting(true)
    console.log("[Programs] handleBuyProgram checkout submitting state set to true")
    try {
      console.log("[Programs] handleBuyProgram building checkout URLs and payload")
      const successUrl = buildCheckoutReturnUrl("success", selectedProgramId)
      const cancelUrl = buildCheckoutReturnUrl("cancel", selectedProgramId)
      const programTitle = getProgramCheckoutTitle(selectedProgramDetails, selectedProgram, editFormValues)
      const payload = {
        program_id: selectedProgramId,
        program_title: programTitle,
        program_name: programTitle,
        success_url: successUrl,
        cancel_url: cancelUrl,
      }
      const response = await axios.post(STRIPE_CHECKOUT_API_URL, payload, buildRequestConfig())
      console.log("[Programs] handleBuyProgram received checkout session response", { response })
      const { checkoutUrl, sessionId } = parseCheckoutSessionResponse(response?.data)
      console.log("[Programs] handleBuyProgram parsed checkout session response", { checkoutUrl, sessionId })
      if (checkoutUrl) {
        savePendingCheckoutProgramId(selectedProgramId)
        window.location.assign(checkoutUrl)
        return
      }

      if (sessionId) {
        const publishableKey = getStripePublishableKey()
        if (!publishableKey) {
          throw new Error("Missing Stripe publishable key. Set VITE_STRIPE_PUBLISHABLE_KEY.")
        }
        const { loadStripe } = await import("@stripe/stripe-js")
        const stripe = await loadStripe(publishableKey)
        if (!stripe) throw new Error("Unable to initialize Stripe checkout.")
        savePendingCheckoutProgramId(selectedProgramId)
        const result = await stripe.redirectToCheckout({ sessionId })
        if (result?.error?.message) {
          clearPendingCheckoutProgramId()
          throw new Error(result.error.message)
        }
        return
      }

      throw new Error("Checkout session response did not include a redirect URL or session ID.")
    } catch (error) {
      setCheckoutErrorMessage(
        error?.response?.data?.detail ||
        error?.message ||
        "Unable to start checkout right now. Please try again.",
      )
    } finally {
      setIsCheckoutSubmitting(false)
    }
  }

  const handleAddExerciseToDetailWeek = () => {
    if (!isDetailsEditMode || !canEditSelectedProgram) return

    const weekNumber = Number(detailPlanWeek)
    const exerciseId = Number(detailPlanExerciseId)
    if (!Number.isFinite(weekNumber) || !Number.isFinite(exerciseId)) return

    const totalWeeks = normalizeDurationWeeks(editFormValues.duration_weeks)
    setDetailWorkoutPlan((prev) => {
      const basePlan = totalWeeks > 0 ? buildWorkoutPlanForDuration(totalWeeks, prev) : [...prev]
      return basePlan.map((weekEntry) => {
        if (weekEntry.week_number !== weekNumber) return weekEntry
        if (weekEntry.exercise_ids.includes(exerciseId)) return weekEntry
        return {
          ...weekEntry,
          exercise_ids: [...weekEntry.exercise_ids, exerciseId],
        }
      })
    })
    setEditFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
    setDetailPlanExerciseId("")
  }

  const handleAddSavedWorkoutToDetailWeek = () => {
    if (!isDetailsEditMode || !canEditSelectedProgram) return

    const weekNumber = Number(detailPlanWeek)
    const selectedWorkout = workoutById.get(String(detailPlanWorkoutId))
    const workoutExerciseIds = Array.isArray(selectedWorkout?.exercise_ids)
      ? selectedWorkout.exercise_ids.map((exerciseId) => Number(exerciseId)).filter((exerciseId) => Number.isFinite(exerciseId))
      : []
    if (!Number.isFinite(weekNumber) || workoutExerciseIds.length === 0) return

    const totalWeeks = normalizeDurationWeeks(editFormValues.duration_weeks)
    setDetailWorkoutPlan((prev) => {
      const basePlan = totalWeeks > 0 ? buildWorkoutPlanForDuration(totalWeeks, prev) : [...prev]
      return basePlan.map((weekEntry) => {
        if (weekEntry.week_number !== weekNumber) return weekEntry
        return {
          ...weekEntry,
          exercise_ids: [...new Set([...weekEntry.exercise_ids, ...workoutExerciseIds])],
        }
      })
    })
    setEditFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
    setDetailPlanWorkoutId("")
  }

  const handleRemoveExerciseFromDetailWeek = (weekNumber, exerciseId) => {
    if (!isDetailsEditMode || !canEditSelectedProgram) return

    setDetailWorkoutPlan((prev) =>
      prev.map((weekEntry) => {
        if (weekEntry.week_number !== weekNumber) return weekEntry
        return {
          ...weekEntry,
          exercise_ids: weekEntry.exercise_ids.filter((candidateId) => candidateId !== exerciseId),
        }
      }),
    )
    setEditFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
  }

  const getDifficultyLabel = (value) => {
    const match = difficultyChoices.find((c) => c.value === value)
    return match ? match.label : value
  }

  const getDifficultyClass = (value) => {
    const normalized = String(value ?? "").toLowerCase().replace(/[^a-z]/g, "")
    if (normalized === "beginner") return "programs-badge programs-badge-beginner"
    if (normalized === "intermediate") return "programs-badge programs-badge-intermediate"
    if (normalized === "advanced") return "programs-badge programs-badge-advanced"
    if (normalized === "alllevels") return "programs-badge programs-badge-all-levels"
    return "programs-badge"
  }

  const handleOpenScheduleModal = () => {
    const todayStr = new Date().toISOString().slice(0, 10)
    setScheduleStartDate(todayStr)
    setScheduleError("")
    setScheduleSuccess("")
    setIsScheduleModalOpen(true)
  }

  const handleCloseScheduleModal = () => {
    setIsScheduleModalOpen(false)
    setScheduleError("")
    setScheduleSuccess("")
  }

  const handleScheduleProgram = () => {
    if (!scheduleStartDate) {
      setScheduleError("Please select a start date.")
      return
    }
  

    const program = programDetailsById[selectedProgramId] ?? selectedProgram
    if (!program) {
      setScheduleError("Program details not available.")
      return
    }

    const plan = Array.isArray(detailWorkoutPlan) && detailWorkoutPlan.length > 0
      ? detailWorkoutPlan
      : buildWorkoutPlanFromProgram(program)

    if (plan.length === 0) {
      setScheduleError("This program has no workout plan to schedule.")
      return
    }

    const programName = String(program?.name || program?.title || "Unnamed Program")
    const programId = program.id

    // Parse start date without timezone shift
    const [sy, sm, sd] = scheduleStartDate.split("-").map(Number)
    const startDate = new Date(sy, sm - 1, sd)

    const toDateKey = (d) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, "0")
      const day = String(d.getDate()).padStart(2, "0")
      return `${year}-${month}-${day}`
    }

    const generateEntryId = () => `prog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const CALENDAR_KEY = "wodtrackrCalendarEntries"
    let existingEntries = {}
    try {
      const raw = localStorage.getItem(CALENDAR_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") {
          existingEntries = parsed
        }
      }
    } catch {
      existingEntries = {}
    }

    const nextEntries = { ...existingEntries }

    for (const weekEntry of plan) {
      const weekNumber = Number(weekEntry?.week_number)
      if (!Number.isFinite(weekNumber) || weekNumber < 1) continue

      const exerciseIds = Array.isArray(weekEntry?.exercise_ids)
        ? weekEntry.exercise_ids.map(Number).filter((id) => Number.isFinite(id))
        : []

      // Place workout on Monday of that week (startDate is day 1 of week 1)
      const weekOffset = (weekNumber - 1) * 7
      const workoutDate = new Date(startDate)
      workoutDate.setDate(startDate.getDate() + weekOffset)
      const dateKey = toDateKey(workoutDate)

      const newEntry = {
        id: generateEntryId(),
        title: `${programName} – Week ${weekNumber}`,
        time: "",
        notes: `Week ${weekNumber} of ${programName} (${plan.length}-week program)`,
        programId,
        programName,
        weekNumber,
        exerciseIds,
      }

      nextEntries[dateKey] = [...(nextEntries[dateKey] || []), newEntry]
    }

    try {
      localStorage.setItem(CALENDAR_KEY, JSON.stringify(nextEntries))
    } catch {
      setScheduleError("Unable to save to calendar. Storage may be full.")
      return
    }

    setScheduleSuccess(`Scheduled ${plan.length} week${plan.length !== 1 ? "s" : ""} starting ${scheduleStartDate}. Check your Calendar!`)
    setScheduleError("")
  }

  useEffect(() => {
    if (!selectedProgramId) return
    if (isDetailsEditMode) return

    const sourceProgram = programDetailsById[selectedProgramId] ?? selectedProgram
    if (!sourceProgram) return

    const nextWorkoutPlan = buildWorkoutPlanFromProgram(sourceProgram)
    setDetailWorkoutPlan(nextWorkoutPlan)
    setDetailPlanWeek(nextWorkoutPlan[0]?.week_number || 1)
    setDetailPlanExerciseId("")
    setDetailPlanWorkoutId("")
  }, [selectedProgramId, programDetailsById, selectedProgram, isDetailsEditMode])

  return (
    <main className="programs-page" aria-label="Training Programs">
      <header className="programs-top-bar">
        <div className="programs-search-area">
          <label className="programs-field-label" htmlFor="program-search">
            Search Programs
          </label>
          <input
            id="program-search"
            type="text"
            className="programs-search-input"
            value={searchName}
            onChange={handleSearchChange}
            placeholder="Search by name or description..."
          />
        </div>
        <div className="programs-sort-area">
          <label className="programs-field-label" htmlFor="program-sort">
            Sort
          </label>
          <select
            id="program-sort"
            className="programs-sort-select"
            value={sortOrder}
            onChange={handleSortChange}
          >
            <option value="asc">Name (A–Z)</option>
            <option value="desc">Name (Z–A)</option>
          </select>
        </div>
        <div className="programs-top-actions">
          <button type="button" className="programs-new-btn" onClick={handleOpenCreateModal}>
            New Program
          </button>
        </div>
      </header>

      <div className="programs-shell">
        <aside className="programs-filter-panel" aria-label="Program Filters">
          <div className="programs-filter-header">
            <h2>Filters</h2>
            <button type="button" className="programs-clear-btn" onClick={handleClearFilters}>
              Clear
            </button>
          </div>

          <div className="programs-filter-group">
            <span className="programs-filter-label">Difficulty</span>
            <div className="programs-filter-checkboxes">
              {difficulties.map((d) => (
                <label key={d.value} className="programs-checkbox-label">
                  <input
                    type="checkbox"
                    value={d.value}
                    checked={filters.difficulty.includes(d.value)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...filters.difficulty, d.value]
                        : filters.difficulty.filter((v) => v !== d.value)
                      filteredAndSortedLibrary("difficulty", next)
                    }}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>

          <div className="programs-filter-group">
            <span className="programs-filter-label">Category</span>
            <MultiSelect
              options={categoryFilterOptions}
              value={filterCategoryValues}
              onChange={(selected) => filteredAndSortedLibrary("category", selected)}
              name="filter-category"
            />
          </div>

          <div className="programs-filter-group">
            <span className="programs-filter-label">Goal</span>
            <MultiSelect
              options={goalFilterOptions}
              value={filterGoalValues}
              onChange={(selected) => filteredAndSortedLibrary("goal", selected)}
              name="filter-goal"
            />
          </div>

          <div className="programs-filter-group">
            <span className="programs-filter-label">Equipment</span>
            <MultiSelect
              options={equipments}
              value={filterEquipmentValues}
              onChange={(selected) => filteredAndSortedLibrary("equipment", selected)}
              name="filter-equipment"
              emitOptionObjects
            />
          </div>



          <p className="programs-results-count" aria-live="polite">
            {filteredAndSortedLibrary.length} program{filteredAndSortedLibrary.length !== 1 ? "s" : ""} found
          </p>
        </aside>

        <section className="programs-main">
          {isLoading ? (
            <p className="programs-empty" role="status">
              Loading programs...
            </p>
          ) : errorMessage ? (
            <p className="programs-empty" role="alert">
              {errorMessage}
            </p>
          ) : filteredAndSortedLibrary.length === 0 ? (
            <p className="programs-empty" role="status">
              No programs match your filters.
            </p>
          ) : (
            <div className="programs-grid">
              {filteredAndSortedLibrary.map((program) => (
                <article key={program.id} className="programs-card">
                  <div className="programs-card-header">
                    <h3 className="programs-card-title">{program.name}</h3>
                    <span className={getDifficultyClass(program.difficulty)}>{getDifficultyLabel(program.difficulty)}</span>
                  </div>
                  <p className="programs-card-description">{program.description}</p>
                  <div className="programs-card-tags">
                    <span className="programs-card-tag">{program.category}</span>
                    <span className="programs-card-tag">{program.duration_weeks ?? "?"} weeks</span>
                  </div>
                  <p className="programs-card-goal"><strong>Goal:</strong> {program.goal || "N/A"}</p>
                  <p className="programs-card-creator">By {program.created_by_username || program.created_by || "Unknown"}</p>

                  <div className="programs-card-actions">
                    <button
                      type="button"
                      className="programs-card-action-btn"
                      onClick={() => handleViewDetails(program.id)}
                      disabled={detailLoadingId === program.id}
                    >
                      {detailLoadingId === program.id ? "Loading..." : "View Details"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <nav className="programs-pagination" aria-label="Program pages">
              <button
                type="button"
                className="programs-page-btn"
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={safePage === 1}
                aria-label="Previous page"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`programs-page-btn${page === safePage ? " programs-page-btn-active" : ""}`}
                  onClick={() => setCurrentPage(page)}
                  aria-label={`Page ${page}`}
                  aria-current={page === safePage ? "page" : undefined}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="programs-page-btn"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={safePage === totalPages}
                aria-label="Next page"
              >
                ›
              </button>
            </nav>
          ) : null}
        </section>
      </div>

      {isCreateModalOpen ? (
        <div className="programs-modal-backdrop" role="presentation" onClick={handleCloseCreateModal}>
          <aside
            className="programs-modal custom-scroll"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-new-program-header"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="programs-modal-header">
              <button type="button" className="programs-btn-base programs-modal-close-btn" onClick={handleCloseCreateModal} aria-label="Close create program">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              <h2 className="programs-modal-title" id="create-new-program-header">Create New Program</h2>
            </header>

            <form className="programs-modal-form" onSubmit={handleCreateProgram}>
              {createErrorMessage ? (
                <p className="programs-modal-error" role="alert">{createErrorMessage}</p>
              ) : null}

              <div className="programs-banner-upload">
                {createProgramImageUrl ? (
                <div className="programs-banner-preview">
                  <img src={createProgramImageUrl} alt="Program banner" className="programs-banner-img" />
                </div>
                ) : null}
                <input
                  id="edit-banner-input"
                  type="file"
                  accept="image/*"
                  onChange={handleEditImageChange}
                  className="programs-banner-input-hidden"
                  ref={editImageInputRef}
                />
                <label htmlFor="edit-banner-input" className="programs-banner-upload-btn">
                  {editImagePreview ? "+ Upload" : "+ Upload"}
                </label>
              </div>
              <div className="programs-modal-field">  
              <label id="program-title-label">
                <span>Title</span>
                <input
                  type="text"
                  name="title"
                  value={createFormValues.title}
                  onChange={handleCreateFieldChange}
                  placeholder="Program name"
                  required
                />
                {createFieldErrors.title ? <small className="programs-modal-error">{createFieldErrors.title}</small> : null}
              </label>

              <label id="program-description-label">
                <span>Description</span>
                <textarea
                  name="description"
                  value={createFormValues.description}
                  onChange={handleCreateFieldChange}
                  placeholder="What this program is for"
                  maxLength={500}
                  rows={3}
                  style={{ resize: "none", width: "500px", minHeight: "100px", boxSizing: "border-box" }}
                  required
                />
              
                {createFieldErrors.description ? <small className="programs-modal-error">{createFieldErrors.description}</small> : null}
              </label>
              </div>
              <div className="programs-modal-grid">
                <label>
                  <span>Difficulty</span>
                  <select
                    name="difficulty"
                    value={createFormValues.difficulty}
                    onChange={handleCreateFieldChange}
                    required
                  >
                    <option value="">Select difficulty</option>
                    {difficulties.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  {createFieldErrors.difficulty ? <small className="programs-modal-error">{createFieldErrors.difficulty}</small> : null}
                </label>

                <label>
                  <span>Duration (weeks)</span>
                  <input
                    type="number"
                    min={durationRange.min}
                    max={durationRange.max}
                    name="duration_weeks"
                    value={createFormValues.duration_weeks}
                    onChange={handleCreateFieldChange}
                    placeholder="8"
                    required
                  />
                  {createFieldErrors.duration_weeks ? <small className="programs-modal-error">{createFieldErrors.duration_weeks}</small> : null}
                </label>

                <label>
                  <span>Category</span>
                  <select
                    name="category"
                    value={createFormValues.category}
                    onChange={handleCreateFieldChange}
                    required
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  {createFieldErrors.category ? <small className="programs-modal-error">{createFieldErrors.category}</small> : null}
                </label>

                <label>
                  <span>Goal</span>
                  <select
                    name="goal"
                    value={createFormValues.goal}
                    onChange={handleCreateFieldChange}
                    required
                  >
                    <option value="">Select goal</option>
                    {goals.map((goal) => (
                      <option key={goal.value} value={goal.value}>
                        {goal.label}
                      </option>
                    ))}
                  </select>
                  {createFieldErrors.goal ? <small className="programs-modal-error">{createFieldErrors.goal}</small> : null}
                </label>

                <label>
                  <span>Equipment</span>
                  <MultiSelect
                    options={equipments}
                    value={createEquipmentSelection}
                    onChange={(selected) => {
                      setCreateFormValues((prev) => ({ ...prev, equipment: selected }))
                      setCreateFieldErrors((prev) => ({ ...prev, equipment: "" }))
                    }}
                    name="equipment"
                    emitOptionObjects
                  />
                  {createFieldErrors.equipment ? <small className="programs-modal-error">{createFieldErrors.equipment}</small> : null}
                </label>

              </div>

              <section className="programs-plan-builder" aria-label="Workout plan builder">
                <h3>Workout Plan By Week</h3>
                <p className="programs-plan-helper">
                  Pick a week, choose all exercises for that workout, then add the full workout. The number of weeks matches Duration.
                </p>
                {createFieldErrors.workout_plan ? <small className="programs-modal-error">{createFieldErrors.workout_plan}</small> : null}

                {isExerciseLibraryLoading ? <p className="programs-plan-helper">Loading exercise library...</p> : null}
                {exerciseLibraryError ? <p className="programs-modal-error">{exerciseLibraryError}</p> : null}

                <div className="programs-plan-controls">
                  <label className="programs-modal-field">
                    <span>Week</span>
                    <select
                      name="plan_week"
                      value={String(createPlanWeek)}
                      onChange={(event) => setCreatePlanWeek(Number(event.target.value) || 1)}
                      disabled={workoutPlan.length === 0}
                    >
                      {workoutPlan.length === 0 ? <option value="1">Set duration first</option> : null}
                      {workoutPlan.map((weekEntry) => (
                        <option key={weekEntry.week_number} value={weekEntry.week_number}>
                          Week {weekEntry.week_number}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="programs-modal-field">
                    <span>Saved Workout</span>
                    <select
                      name="plan_saved_workout"
                      value={createPlanWorkoutId}
                      onChange={(event) => setCreatePlanWorkoutId(event.target.value)}
                      disabled={workouts.length === 0 || workoutPlan.length === 0}
                    >
                      <option value="">Select workout</option>
                      {workouts.map((workout) => (
                        <option key={workout.id} value={String(workout.id)}>
                          {workout.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="programs-modal-secondary-btn programs-plan-add-btn"
                    onClick={handleAddSavedWorkoutToCreateWeek}
                    disabled={!createPlanWorkoutId || workoutPlan.length === 0}
                  >
                    Add Saved Workout
                  </button>

                  <label className="programs-modal-field">
                    <span>Workout Exercises</span>
                    {exerciseOptions.map((exercise) => (
                      <label key={exercise.id} className="exercise-label">
                        <input
                          key={exercise.id}
                          type="checkbox"
                          name={"plan_exercises"}
                          value={exercise.title}
                          checked={createPlanExercise.includes(exercise.title)}
                          onChange={(event) => {
                            const selectedIds = event.target.checked
                              ? [...createPlanExercise, String(exercise.title)]
                              : createPlanExercise.filter((id) => id !== String(exercise.title))
                            setCreatePlanExercise(selectedIds)
                          }}
                          disabled={exerciseOptions.length === 0 || workoutPlan.length === 0}
                        />
                        <div className="multiselect-option">{exercise.title}</div>
                      </label>
                    ))}
                  </label>

                  <button
                    type="button"
                    className="programs-modal-secondary-btn programs-plan-add-btn"
                    onClick={() => handleAddWorkoutToPlanWeek(weekEntry.week_number, weekEntry.exercise_ids)}
                    disabled={createPlanExercise.length === 0 || workoutPlan.length === 0}
                  >
                    {console.log("Rendering Add Workout button", { createPlanExercise, workoutPlan })}
                    Add Workout
                  </button>
                </div>

                <div className="programs-plan-weeks">
                  {workoutPlan.length === 0 ? (
                    <p className="programs-plan-helper">Enter duration to start building your weekly workout plan.</p>
                  ) : (
                    workoutPlan.map((weekEntry) => (
                      <article key={weekEntry.week_number} className="programs-plan-week-card">
                        <h4>Week {weekEntry.week_number}</h4>
                        {weekEntry.exercise_ids.length === 0 ? (
                          <p className="programs-plan-helper">No workout added yet.</p>
                        ) : (
                          <ul className="programs-plan-exercise-list">
                            {weekEntry.exercise_ids.map((exerciseId) => (
                              console.log("Rendering exercise list item", { weekNumber: weekEntry.week_number, exerciseId }),
                              <li key={`${weekEntry.week_number}-${exerciseId}`}>
                                <span>{exerciseNameById[exerciseId] || `Exercise #${exerciseId}`}</span>
                                <button
                                  type="button"
                                  className="programs-plan-remove-btn"
                                  onClick={() => handleRemoveExerciseFromWorkoutWeek(weekEntry.week_number, exerciseId)}
                                  aria-label={`Remove ${exerciseNameById[exerciseId] || `exercise ${exerciseId}`} from week ${weekEntry.week_number}`}
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>

              <label className="programs-modal-checkbox">
                <input
                  type="checkbox"
                  name="is_public"
                  checked={createFormValues.is_public}
                  onChange={handleCreateFieldChange}
                />
                Public program
              </label>

              <div className="programs-modal-actions">
                <button type="submit" className="programs-modal-primary-btn" disabled={isCreateSubmitting}>
                  {isCreateSubmitting ? "Creating..." : "Create Program"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {selectedProgramId ? (
        <div className="programs-modal-backdrop" role="presentation" onClick={handleCloseDetailsModal}>
          <aside
            className="programs-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="programs-detail-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="programs-modal-header">
              <button type="button" className="programs-btn-base programs-modal-secondary-btn" onClick={handleCloseDetailsModal}>
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              {console.log("Selected Program Image URL", {selectedProgramImageUrl})}
               {selectedProgramImageUrl ? (
                <div className="programs-banner-preview">
                  <img src={selectedProgramImageUrl} alt="Program banner" className="programs-banner-img" />
                </div>
              ) : null}
              <h2 className="programs-modal-title">
                {selectedProgramDetails?.title || selectedProgram?.title || "Program Details"}
              </h2>
            </header>

            <form className="programs-modal-form" onSubmit={handleUpdateProgram}>
              {detailLoadingId === selectedProgramId ? (
                <p className="programs-card-feedback" role="status">Loading program details...</p>
              ) : null}

              {detailErrorById[selectedProgramId] ? (
                <p className="programs-modal-error" role="alert">{detailErrorById[selectedProgramId]}</p>
              ) : null}

              {editErrorMessage ? (
                <p className="programs-modal-error" role="alert">{editErrorMessage}</p>
              ) : null}

              {checkoutErrorMessage ? (
                <p className="programs-modal-error" role="alert">{checkoutErrorMessage}</p>
              ) : null}

              {isDetailsEditMode ? (
                <div className="programs-banner-upload" id="create-gym-banner-btn">
                  <input
                    id="edit-banner-input"
                    type="file"
                    accept="image/*"
                    onChange={handleEditImageChange}
                    className="programs-banner-input-hidden"
                    ref={editImageInputRef}
                  />
                  <label htmlFor="edit-banner-input" className="programs-banner-upload-btn">
                    {editImagePreview ? "Change Image" : "Add Image"}
                  </label>
                </div>
              ) : null}

              {isDetailsEditMode ? (
                <>
                  <label className="programs-modal-field">
                    <span>Title</span>
                    <input
                      type="text"
                      name="title"
                      value={editFormValues.title}
                      onChange={handleEditFieldChange}
                      placeholder="Program name"
                      required
                    />
                    {editFieldErrors.title ? <small className="programs-modal-error">{editFieldErrors.title}</small> : null}
                  </label>

                  <label className="programs-modal-field">
                    <span>Description</span>
                    <textarea
                      name="description"
                      value={editFormValues.description}
                      onChange={handleEditFieldChange}
                      placeholder="What this program is for"
                      rows={3}
                      required
                    />
                    {editFieldErrors.description ? <small className="programs-modal-error">{editFieldErrors.description}</small> : null}
                  </label>

                  <div className="programs-modal-grid">
                    <label className="programs-modal-field">
                      <span>Difficulty</span>
                      <select
                        name="difficulty"
                        value={editFormValues.difficulty}
                        onChange={handleEditFieldChange}
                        required
                      >
                        <option value="">Select difficulty</option>
                        {difficulties.map((difficulty) => (
                          <option key={difficulty.value} value={difficulty.value}>
                            {difficulty.label}
                          </option>
                        ))}
                      </select>
                      {editFieldErrors.difficulty ? <small className="programs-modal-error">{editFieldErrors.difficulty}</small> : null}
                    </label>

                    <label className="programs-modal-field">
                      <span>Duration (weeks)</span>
                      <input
                        type="number"
                        min={durationRange.min}
                        max={durationRange.max}
                        name="duration_weeks"
                        value={editFormValues.duration_weeks}
                        onChange={handleEditFieldChange}
                        placeholder="8"
                        required
                      />
                      {editFieldErrors.duration_weeks ? <small className="programs-modal-error">{editFieldErrors.duration_weeks}</small> : null}
                    </label>

                    <label className="programs-modal-field">
                      <span>Category</span>
                      <select
                        name="category"
                        value={editFormValues.category}
                        onChange={handleEditFieldChange}
                        required
                      >
                        <option value="">Select category</option>
                        {categories.map((category) => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                      {editFieldErrors.category ? <small className="programs-modal-error">{editFieldErrors.category}</small> : null}
                    </label>

                    <label className="programs-modal-field">
                      <span>Goal</span>
                      <select
                        name="goal"
                        value={editFormValues.goal}
                        onChange={handleEditFieldChange}
                        required
                      >
                        <option value="">Select goal</option>
                        {goals.map((goal) => (
                          <option key={goal.value} value={goal.value}>
                            {goal.label}
                          </option>
                        ))}
                      </select>
                      {editFieldErrors.goal ? <small className="programs-modal-error">{editFieldErrors.goal}</small> : null}
                    </label>

                    <label className="programs-modal-field">
                      <span>Equipment</span>
                      <MultiSelect
                        options={equipments}
                        value={editEquipmentSelection}
                        onChange={(selected) => {
                          setEditFormValues((prev) => ({ ...prev, equipment: selected }))
                          setEditFieldErrors((prev) => ({ ...prev, equipment: "" }))
                        }}
                        name="equipment"
                        emitOptionObjects
                      />
                      {editFieldErrors.equipment ? <small className="programs-modal-error">{editFieldErrors.equipment}</small> : null}
                    </label>

                  </div>

                  <label className="programs-modal-checkbox">
                    <input
                      type="checkbox"
                      name="is_public"
                      checked={editFormValues.is_public}
                      onChange={handleEditFieldChange}
                    />
                    Public program
                  </label>
                </>
              ) : (
                <section className="programs-modal-grid" aria-label="Program details summary">
                  <p className="programs-card-detail-line"><strong>Title:</strong> {editFormValues.title || "N/A"}</p>
                  <p className="programs-card-detail-line"><strong>Description:</strong> {editFormValues.description || "N/A"}</p>
                  <p className="programs-card-detail-line"><strong>Difficulty:</strong> {editFormValues.difficulty || "N/A"}</p>
                  <p className="programs-card-detail-line"><strong>Duration:</strong> {editFormValues.duration_weeks ? `${editFormValues.duration_weeks} weeks` : "N/A"}</p>
                  <p className="programs-card-detail-line"><strong>Category:</strong> {editFormValues.category || "N/A"}</p>
                  <p className="programs-card-detail-line">
                    <strong>Updated:</strong> {formatTimestamp(selectedProgramDetails?.updated_at || selectedProgram?.updated_at) || "N/A"}
                  </p>
                </section>
              )}

              {isDetailsEditMode || isWorkoutPlanUnlocked ? (
                <section className="programs-plan-builder" aria-label="Workout plan by week">
                  <h3>Workout Plan By Week</h3>
                  <p className="programs-plan-helper">
                    {canEditSelectedProgram && isDetailsEditMode
                      ? "Edit workouts by selecting a week and exercise."
                      : "Purchased workout plan view."}
                  </p>
                  {editFieldErrors.workout_plan ? <small className="programs-modal-error">{editFieldErrors.workout_plan}</small> : null}

                  {canEditSelectedProgram && isDetailsEditMode ? (
                    <div className="programs-plan-controls">
                      <label className="programs-modal-field">
                        <span>Week</span>
                        <select
                          name="details_plan_week"
                          value={String(detailPlanWeek)}
                          onChange={(event) => setDetailPlanWeek(Number(event.target.value) || 1)}
                          disabled={detailsWorkoutPlan.length === 0}
                        >
                          {detailsWorkoutPlan.length === 0 ? <option value="1">No weeks available</option> : null}
                          {detailsWorkoutPlan.map((weekEntry) => (
                            <option key={weekEntry.week_number} value={weekEntry.week_number}>
                              Week {weekEntry.week_number}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="programs-modal-field">
                        <span>Saved Workout</span>
                        <select
                          name="details_plan_saved_workout"
                          value={detailPlanWorkoutId}
                          onChange={(event) => setDetailPlanWorkoutId(event.target.value)}
                          disabled={workouts.length === 0 || detailsWorkoutPlan.length === 0}
                        >
                          <option value="">Select workout</option>
                          {workouts.map((workout) => (
                            <option key={workout.id} value={String(workout.id)}>
                              {workout.title}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        className="programs-modal-secondary-btn programs-plan-add-btn"
                        onClick={handleAddSavedWorkoutToDetailWeek}
                        disabled={!detailPlanWorkoutId || detailsWorkoutPlan.length === 0}
                      >
                        Add Saved Workout
                      </button>

                      <label className="programs-modal-field">
                        <span>Exercise</span>
                        <select
                          name="details_plan_exercise"
                          value={detailPlanExerciseId}
                          onChange={(event) => setDetailPlanExerciseId(event.target.value)}
                          disabled={exerciseOptions.length === 0 || detailsWorkoutPlan.length === 0}
                        >
                          <option value="">Select exercise</option>
                          {exerciseOptions.map((exercise) => (
                            <option key={exercise.id} value={String(exercise.id)}>
                              {exercise.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        className="programs-modal-secondary-btn programs-plan-add-btn"
                        onClick={handleAddExerciseToDetailWeek}
                        disabled={!detailPlanExerciseId || detailsWorkoutPlan.length === 0}
                      >
                        Add Exercise
                      </button>
                    </div>
                  ) : null}

                  <div className="programs-plan-weeks">
                    {detailsWorkoutPlan.length === 0 ? (
                      <p className="programs-plan-helper">No workout plan set for this program yet.</p>
                    ) : (
                      detailsWorkoutPlan.map((weekEntry) => (
                        <article key={`details-week-${weekEntry.week_number}`} className="programs-plan-week-card">
                          <h4>Week {weekEntry.week_number}</h4>
                          {weekEntry.exercise_ids.length === 0 ? (
                            <p className="programs-plan-helper">No exercises added yet.</p>
                          ) : (
                            <ul className="programs-plan-exercise-list">
                              {weekEntry.exercise_ids.map((exerciseId) => (
                                <li key={`details-${weekEntry.week_number}-${exerciseId}`}>
                                  <span>{exerciseNameById[exerciseId] || `Exercise #${exerciseId}`}</span>
                                  {canEditSelectedProgram && isDetailsEditMode ? (
                                    <button
                                      type="button"
                                      className="programs-plan-remove-btn"
                                      onClick={() => handleRemoveExerciseFromDetailWeek(weekEntry.week_number, exerciseId)}
                                      aria-label={`Remove ${exerciseNameById[exerciseId] || `exercise ${exerciseId}`} from week ${weekEntry.week_number}`}
                                    >
                                      Remove
                                    </button>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              <div className="programs-modal-actions">
                {!isDetailsEditMode && !isWorkoutPlanUnlocked ? (
                  <button
                    type="button"
                    className="programs-modal-primary-btn"
                    onClick={handleBuyProgram}
                    disabled={detailLoadingId === selectedProgramId || isCheckoutSubmitting}
                  >
                    {isCheckoutSubmitting ? "Redirecting..." : "Buy Program"}
                  </button>
                ) : null}
                {canEditSelectedProgram && !isDetailsEditMode ? (
                  <button
                    type="button"
                    className="programs-modal-primary-btn"
                    onClick={handleStartEditProgram}
                    disabled={detailLoadingId === selectedProgramId}
                  >
                    Edit Program
                  </button>
                ) : null}
                {!isDetailsEditMode ? (
                  <button
                    type="button"
                    className="programs-schedule-btn"
                    onClick={handleOpenScheduleModal}
                    disabled={detailLoadingId === selectedProgramId}
                  >
                    Schedule to Calendar
                  </button>
                ) : null}
                {canEditSelectedProgram && isDetailsEditMode ? (
                  <button
                    type="button"
                    className="programs-modal-danger-btn"
                    onClick={handleDeleteProgram}
                    disabled={isDeleteSubmitting || isEditSubmitting}
                  >
                    {isDeleteSubmitting ? "Deleting..." : "Delete Program"}
                  </button>
                ) : null}
                {canEditSelectedProgram && isDetailsEditMode ? (
                  <button type="submit" className="programs-modal-primary-btn" disabled={isEditSubmitting || isDeleteSubmitting}>
                    {isEditSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                ) : null}
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {isScheduleModalOpen ? (
        <div className="programs-modal-backdrop" role="presentation" onClick={handleCloseScheduleModal}>
          <aside
            className="programs-modal programs-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Schedule program to calendar"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="programs-modal-header">
              <button type="button" className="programs-btn-base programs-modal-secondary-btn" onClick={handleCloseScheduleModal} aria-label="Close schedule modal">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              <h2 className="programs-modal-title">Schedule to Calendar</h2>
            </header>

            <div className="programs-modal-form">
              <p className="programs-schedule-description">
                Choose a start date for <strong>{(programDetailsById[selectedProgramId] ?? selectedProgram)?.name || (programDetailsById[selectedProgramId] ?? selectedProgram)?.title || "this program"}</strong>.
                One workout entry will be added to your calendar for each week of the program.
              </p>

              {scheduleError ? (
                <p className="programs-modal-error" role="alert">{scheduleError}</p>
              ) : null}

              {scheduleSuccess ? (
                <p className="programs-schedule-success" role="status">{scheduleSuccess}</p>
              ) : null}

              {!scheduleSuccess ? (
                <>
                  <label className="programs-modal-field programs-schedule-date-field">
                    <span>Start Date</span>
                    <input
                      type="date"
                      value={scheduleStartDate}
                      onChange={(e) => {
                        setScheduleStartDate(e.target.value)
                        setScheduleError("")
                      }}
                    />
                  </label>

                  <p className="programs-plan-helper">
                    {detailWorkoutPlan.length > 0
                      ? `This will create ${detailWorkoutPlan.length} calendar entr${detailWorkoutPlan.length !== 1 ? "ies" : "y"} (one per week).`
                      : "No workout plan found. Please add weeks to this program first."}
                  </p>

                  <div className="programs-modal-actions">
                    <button
                      type="button"
                      className="programs-modal-primary-btn"
                      onClick={handleScheduleProgram}
                      disabled={detailWorkoutPlan.length === 0}
                    >
                      Confirm Schedule
                    </button>
                    <button type="button" className="programs-modal-secondary-btn" onClick={handleCloseScheduleModal}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="programs-modal-actions">
                  <button type="button" className="programs-modal-primary-btn" onClick={handleCloseScheduleModal}>
                    Done
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  )
}

export default Programs
