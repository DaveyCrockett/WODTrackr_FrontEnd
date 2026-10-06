import "../CSS/programs.css"
import "../CSS/multiselect.css"
import axios from "axios"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from 'react-router-dom'
import { useProgramForm } from "./contexts/ProgramFormContext"
import MultiSelect from "./MultiSelect"
import { buildRequestConfig } from "../utils/exerciseUtils"

const API_URL = "/api/wodtrackr/exercise-programs/"
const EXERCISES_API_URL = "/api/wodtrackr/exercises/"
const STRIPE_CHECKOUT_API_URL = String(
  import.meta.env.VITE_CHECKOUT_SESSION_API_URL || "/api/users/billing/stripe/checkout-session/",
).trim()
const WORKOUTS_STORAGE_KEY = "wodtrackrWorkouts"
const PURCHASED_PROGRAMS_STORAGE_KEY = "wodtrackrPurchasedProgramIds"
const PENDING_CHECKOUT_PROGRAM_ID_STORAGE_KEY = "wodtrackrPendingCheckoutProgramId"
const CREATE_PROGRAM_DRAFT_STORAGE_KEY = "wodtrackrCreateProgramDraftV1"
const PAGE_SIZE = 18
const SKELETON_CARD_COUNT = 6
const DEFAULT_DIFFICULTIES = ["All Levels", "Beginner", "Intermediate", "Advanced"]
const DEFAULT_DURATION_MIN = 1
const DEFAULT_DURATION_MAX = 12
const PROGRAMS_CHOICES_CACHE_KEY = "wodtrackrProgramChoicesV4"
const CHOICES_CACHE_TTL_MS = 1000 * 60 * 60 * 12
const hasMetadataPayload = (value) => Boolean(value && typeof value === "object" && Object.keys(value).length > 0)

const saveCreateProgramDraft = (payload) => {
  try {
    sessionStorage.setItem(CREATE_PROGRAM_DRAFT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore draft persistence failures.
  }
}

const loadCreateProgramDraft = () => {
  try {
    const raw = sessionStorage.getItem(CREATE_PROGRAM_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

const clearCreateProgramDraft = () => {
  try {
    sessionStorage.removeItem(CREATE_PROGRAM_DRAFT_STORAGE_KEY)
  } catch {
    // Ignore draft cleanup failures.
  }
}

const normalizeDurationWeeks = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

const buildProgramItemsApiUrl = (programId) => `${API_URL}${programId}/item/`
const buildProgramItemDetailApiUrl = (programId, itemId) => `${API_URL}${programId}/item/${itemId}/`

const toPositiveIntegerOrNull = (value) => {
  const candidate = Number(value)
  if (!Number.isFinite(candidate) || candidate <= 0) return null
  return Math.floor(candidate)
}

const normalizePlanExerciseEntry = (entry) => {
  const exerciseId = Number(entry?.exercise_id ?? entry?.exerciseId ?? entry?.exercise?.id ?? entry?.exercise)
  if (!Number.isFinite(exerciseId)) return null

  const setNumber = toPositiveIntegerOrNull(entry?.set_number ?? entry?.setNumber ?? entry?.sets)
  const reps = toPositiveIntegerOrNull(entry?.reps)
  const timeSeconds = toPositiveIntegerOrNull(
    entry?.time_seconds ?? entry?.timeSeconds ?? entry?.time ?? entry?.duration_seconds ?? entry?.durationSeconds,
  )

  return {
    exercise_id: exerciseId,
    ...(setNumber ? { set_number: setNumber } : {}),
    ...(reps ? { reps } : {}),
    ...(timeSeconds ? { time_seconds: timeSeconds } : {}),
  }
}

const mergePlanExerciseEntries = (entries) => {
  const entriesByExerciseId = new Map()
  for (const rawEntry of Array.isArray(entries) ? entries : []) {
    const normalizedEntry = normalizePlanExerciseEntry(rawEntry)
    if (!normalizedEntry) continue
    const currentEntry = entriesByExerciseId.get(normalizedEntry.exercise_id)
    entriesByExerciseId.set(normalizedEntry.exercise_id, {
      exercise_id: normalizedEntry.exercise_id,
      set_number: normalizedEntry.set_number ?? currentEntry?.set_number,
      reps: normalizedEntry.reps ?? currentEntry?.reps,
      time_seconds: normalizedEntry.time_seconds ?? currentEntry?.time_seconds,
    })
  }

  return [...entriesByExerciseId.values()].map((entry) => ({
    exercise_id: entry.exercise_id,
    ...(entry.set_number ? { set_number: entry.set_number } : {}),
    ...(entry.reps ? { reps: entry.reps } : {}),
    ...(entry.time_seconds ? { time_seconds: entry.time_seconds } : {}),
  }))
}

const buildDefaultWodTitle = (index) => `WOD ${index + 1}`

const buildWodKey = (weekNumber, index) => `week-${weekNumber}-wod-${index + 1}`

const normalizeWodEntry = (wodEntry, weekNumber, index = 0) => {
  const titleCandidate = String(wodEntry?.title ?? wodEntry?.name ?? "").trim()
  const isRest = Boolean(wodEntry?.is_rest ?? wodEntry?.isRest)
  const exerciseEntries = mergePlanExerciseEntries(
    Array.isArray(wodEntry?.exercise_entries)
      ? wodEntry.exercise_entries
      : Array.isArray(wodEntry?.exercises)
        ? wodEntry.exercises
        : [],
  )

  return {
    key: String(wodEntry?.key ?? wodEntry?.id ?? buildWodKey(weekNumber, index)),
    title: titleCandidate || buildDefaultWodTitle(index),
    is_rest: isRest,
    exercise_entries: isRest ? [] : exerciseEntries,
  }
}

const buildWodsFromWeekEntry = (weekEntry) => {
  const weekNumber = Number(weekEntry?.week_number)
  const normalizedWeek = Number.isFinite(weekNumber) && weekNumber > 0 ? weekNumber : 1
  if (Array.isArray(weekEntry?.wods) && weekEntry.wods.length > 0) {
    return weekEntry.wods.map((wodEntry, index) => normalizeWodEntry(wodEntry, normalizedWeek, index))
  }

  const fallbackEntries = mergePlanExerciseEntries([
    ...(Array.isArray(weekEntry?.exercise_entries) ? weekEntry.exercise_entries : []),
    ...(Array.isArray(weekEntry?.exercise_ids) ? weekEntry.exercise_ids.map((exercise_id) => ({ exercise_id })) : []),
  ])

  if (fallbackEntries.length === 0) return []

  return [normalizeWodEntry({ title: "WOD 1", exercise_entries: fallbackEntries }, normalizedWeek, 0)]
}

const deriveWeekFieldsFromWods = (weekNumber, wods) => {
  const normalizedWods = (Array.isArray(wods) ? wods : []).map((wodEntry, index) =>
    normalizeWodEntry(wodEntry, weekNumber, index),
  )
  const exerciseEntries = normalizedWods.flatMap((wodEntry) => buildExerciseEntriesFromWeekEntry(wodEntry))
  const mergedEntries = mergePlanExerciseEntries(exerciseEntries)
  return {
    wods: normalizedWods,
    exercise_entries: mergedEntries,
    exercise_ids: mergedEntries.map((entry) => entry.exercise_id),
  }
}

const buildExerciseEntriesFromWeekEntry = (weekEntry) => {
  if (Array.isArray(weekEntry?.wods) && weekEntry.wods.length > 0) {
    return mergePlanExerciseEntries(
      weekEntry.wods.flatMap((wodEntry) =>
        Array.isArray(wodEntry?.exercise_entries) ? wodEntry.exercise_entries : [],
      ),
    )
  }

  const explicitEntries = Array.isArray(weekEntry?.exercise_entries) ? weekEntry.exercise_entries : []
  const fallbackIdEntries = (Array.isArray(weekEntry?.exercise_ids) ? weekEntry.exercise_ids : [])
    .map((exerciseId) => normalizePlanExerciseEntry({ exercise_id: exerciseId }))
    .filter(Boolean)

  return mergePlanExerciseEntries([...explicitEntries, ...fallbackIdEntries])
}

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

    const wods = buildWodsFromWeekEntry(weekEntry)
    const orderedExerciseEntries =
      wods.length > 0
        ? wods.flatMap((wodEntry) =>
          Array.isArray(wodEntry?.exercise_entries) ? wodEntry.exercise_entries : [],
        )
        : buildExerciseEntriesFromWeekEntry(weekEntry)

    for (const exerciseEntry of orderedExerciseEntries) {
      const normalizedEntry = normalizePlanExerciseEntry(exerciseEntry)
      if (!normalizedEntry) continue
      items.push({
        exercise: normalizedEntry.exercise_id,
        position,
        week: weekNumber,
        day: 1,
        ...(normalizedEntry.set_number ? { set_number: normalizedEntry.set_number } : {}),
        ...(normalizedEntry.reps ? { reps: normalizedEntry.reps } : {}),
        ...(normalizedEntry.time_seconds ? { time_seconds: normalizedEntry.time_seconds } : {}),
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
  const setNumber = toPositiveIntegerOrNull(item?.set_number ?? item?.setNumber ?? item?.sets)
  const reps = toPositiveIntegerOrNull(item?.reps)
  const timeSeconds = toPositiveIntegerOrNull(
    item?.time_seconds ?? item?.timeSeconds ?? item?.time ?? item?.duration_seconds ?? item?.durationSeconds,
  )

  return {
    id: Number.isFinite(idCandidate) ? idCandidate : null,
    exercise,
    week,
    day: Number.isFinite(dayCandidate) && dayCandidate > 0 ? dayCandidate : 1,
    position: Number.isFinite(positionCandidate) && positionCandidate > 0 ? positionCandidate : fallbackPosition,
    ...(setNumber ? { set_number: setNumber } : {}),
    ...(reps ? { reps } : {}),
    ...(timeSeconds ? { time_seconds: timeSeconds } : {}),
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
  Number(left?.position) === Number(right?.position) &&
  Number(left?.set_number ?? 0) === Number(right?.set_number ?? 0) &&
  Number(left?.reps ?? 0) === Number(right?.reps ?? 0) &&
  Number(left?.time_seconds ?? 0) === Number(right?.time_seconds ?? 0)



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
    const normalizedExerciseEntry = normalizePlanExerciseEntry(item)
    if (!normalizedExerciseEntry) return accumulator

    const weekNumber = Number(item?.week)
    const targetWeek = Number.isFinite(weekNumber) && weekNumber > 0 ? weekNumber : 1
    if (!accumulator[targetWeek]) accumulator[targetWeek] = []
    accumulator[targetWeek].push(normalizedExerciseEntry)
    return accumulator
  }, {})

  const basePlan = Object.entries(grouped)
    .map(([weekNumber, exerciseEntries]) => {
      const mergedEntries = mergePlanExerciseEntries(exerciseEntries)
      return {
        week_number: Number(weekNumber),
        ...deriveWeekFieldsFromWods(Number(weekNumber), [
          { key: buildWodKey(Number(weekNumber), 0), title: "WOD 1", is_rest: false, exercise_entries: mergedEntries },
        ]),
      }
    })
    .sort((a, b) => a.week_number - b.week_number)

  return buildWorkoutPlanForDuration(durationValue, basePlan)
}

const buildWorkoutPlanForDuration = (durationValue, previousPlan = []) => {
  const weeks = normalizeDurationWeeks(durationValue)
  if (weeks === 0) return []

  const planByWeek = new Map(
    (Array.isArray(previousPlan) ? previousPlan : []).map((entry) => [
      Number(entry?.week_number),
      buildWodsFromWeekEntry(entry),
    ]),
  )

  return Array.from({ length: weeks }, (_, index) => {
    const weekNumber = index + 1
    const existingWods = planByWeek.get(weekNumber) ?? []
    const normalizedWods = existingWods.length > 0 ? existingWods : [{ title: "WOD 1", exercise_entries: [] }]
    const weekFields = deriveWeekFieldsFromWods(weekNumber, normalizedWods)
    return {
      week_number: weekNumber,
      ...weekFields,
    }
  })
}

const getWorkoutPlanValidationMessage = (durationValue, workoutPlan) => {
  const normalizedWorkoutPlan = buildWorkoutPlanForDuration(durationValue, workoutPlan)
  if (normalizedWorkoutPlan.length === 0) return ""

  const hasConfiguredWod = (weekEntry) =>
    buildWodsFromWeekEntry(weekEntry).some(
      (wodEntry) => Boolean(wodEntry.is_rest) || (Array.isArray(wodEntry.exercise_entries) && wodEntry.exercise_entries.length > 0),
    )

  const weeksWithWods = normalizedWorkoutPlan.filter((weekEntry) => hasConfiguredWod(weekEntry))
  if (weeksWithWods.length === 0) {
    return "Add at least 1 WOD to your program."
  }

  if (weeksWithWods.length !== normalizedWorkoutPlan.length) {
    return "Each week in the workout plan must include at least 1 WOD."
  }

  return ""
}

const areWorkoutPlansEqual = (leftPlan, rightPlan) => {
  const normalizePlan = (plan) =>
    (Array.isArray(plan) ? plan : [])
      .map((weekEntry) => ({
        week_number: Number(weekEntry?.week_number),
        wods: buildWodsFromWeekEntry(weekEntry).map((wodEntry) => ({
          title: String(wodEntry.title || "").trim(),
          is_rest: Boolean(wodEntry.is_rest),
          exercise_entries: mergePlanExerciseEntries(wodEntry.exercise_entries).map((entry) => ({
            exercise_id: entry.exercise_id,
            set_number: entry.set_number ?? null,
            reps: entry.reps ?? null,
            time_seconds: entry.time_seconds ?? null,
          })),
        })),
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
    if (weekEntry.wods.length !== rightWeekEntry.wods.length) return false
    return weekEntry.wods.every((wodEntry, wodIndex) => {
      const rightWod = rightWeekEntry.wods[wodIndex]
      if (!rightWod) return false
      if (wodEntry.title !== rightWod.title || wodEntry.is_rest !== rightWod.is_rest) return false
      if (wodEntry.exercise_entries.length !== rightWod.exercise_entries.length) return false
      return wodEntry.exercise_entries.every((entry, exerciseIndex) => {
        const rightEntry = rightWod.exercise_entries[exerciseIndex]
        if (!rightEntry) return false
        return (
          Number(entry.exercise_id) === Number(rightEntry.exercise_id) &&
          Number(entry.set_number ?? 0) === Number(rightEntry.set_number ?? 0) &&
          Number(entry.reps ?? 0) === Number(rightEntry.reps ?? 0) &&
          Number(entry.time_seconds ?? 0) === Number(rightEntry.time_seconds ?? 0)
        )
      })
    })
  })
}

const addWodToWeekPlan = (durationValue, currentPlan, weekNumber, wodPayload) => {
  const normalizedWeek = Number(weekNumber)
  if (!Number.isFinite(normalizedWeek) || normalizedWeek < 1) {
    return buildWorkoutPlanForDuration(durationValue, currentPlan)
  }

  const nextWod = normalizeWodEntry(
    {
      key: wodPayload?.key ?? `wod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: wodPayload?.title,
      is_rest: wodPayload?.is_rest,
      exercise_entries: [],
    },
    normalizedWeek,
    999,
  )

  return buildWorkoutPlanForDuration(durationValue, currentPlan).map((weekEntry) => {
    if (weekEntry.week_number !== normalizedWeek) return weekEntry
    const nextWods = [...buildWodsFromWeekEntry(weekEntry), nextWod]
    const weekFields = deriveWeekFieldsFromWods(weekEntry.week_number, nextWods)
    return {
      ...weekEntry,
      ...weekFields,
    }
  })
}

const updateWodInWeekPlan = (durationValue, currentPlan, weekNumber, wodKey, updates) => {
  const normalizedWeek = Number(weekNumber)
  const normalizedWodKey = String(wodKey || "")
  if (!Number.isFinite(normalizedWeek) || normalizedWeek < 1 || !normalizedWodKey) {
    return buildWorkoutPlanForDuration(durationValue, currentPlan)
  }

  return buildWorkoutPlanForDuration(durationValue, currentPlan).map((weekEntry) => {
    if (weekEntry.week_number !== normalizedWeek) return weekEntry
    const nextWods = buildWodsFromWeekEntry(weekEntry).map((wodEntry) => {
      if (String(wodEntry.key) !== normalizedWodKey) return wodEntry
      const title = updates?.title === undefined ? wodEntry.title : String(updates.title || "").trim()
      const isRest = updates?.is_rest === undefined ? wodEntry.is_rest : Boolean(updates.is_rest)
      return normalizeWodEntry(
        {
          ...wodEntry,
          title: title || wodEntry.title,
          is_rest: isRest,
          exercise_entries: isRest ? [] : wodEntry.exercise_entries,
        },
        weekEntry.week_number,
        0,
      )
    })
    const weekFields = deriveWeekFieldsFromWods(weekEntry.week_number, nextWods)
    return {
      ...weekEntry,
      ...weekFields,
    }
  })
}

const reorderWodInWeekPlan = (durationValue, currentPlan, weekNumber, wodKey, direction) => {
  const normalizedWeek = Number(weekNumber)
  const normalizedWodKey = String(wodKey || "")
  if (!Number.isFinite(normalizedWeek) || normalizedWeek < 1 || !normalizedWodKey) {
    return buildWorkoutPlanForDuration(durationValue, currentPlan)
  }

  const offset = direction === "up" ? -1 : direction === "down" ? 1 : 0
  if (offset === 0) return buildWorkoutPlanForDuration(durationValue, currentPlan)

  return buildWorkoutPlanForDuration(durationValue, currentPlan).map((weekEntry) => {
    if (weekEntry.week_number !== normalizedWeek) return weekEntry
    const nextWods = [...buildWodsFromWeekEntry(weekEntry)]
    const currentIndex = nextWods.findIndex((wodEntry) => String(wodEntry.key) === normalizedWodKey)
    if (currentIndex < 0) return weekEntry
    const targetIndex = currentIndex + offset
    if (targetIndex < 0 || targetIndex >= nextWods.length) return weekEntry
    const [movedWod] = nextWods.splice(currentIndex, 1)
    nextWods.splice(targetIndex, 0, movedWod)
    const weekFields = deriveWeekFieldsFromWods(weekEntry.week_number, nextWods)
    return {
      ...weekEntry,
      ...weekFields,
    }
  })
}

const removeWodFromWeekPlan = (durationValue, currentPlan, weekNumber, wodKey) => {
  const normalizedWeek = Number(weekNumber)
  const normalizedWodKey = String(wodKey || "")
  if (!Number.isFinite(normalizedWeek) || normalizedWeek < 1 || !normalizedWodKey) {
    return buildWorkoutPlanForDuration(durationValue, currentPlan)
  }

  return buildWorkoutPlanForDuration(durationValue, currentPlan).map((weekEntry) => {
    if (weekEntry.week_number !== normalizedWeek) return weekEntry
    const nextWods = buildWodsFromWeekEntry(weekEntry).filter((wodEntry) => String(wodEntry.key) !== normalizedWodKey)
    const weekFields = deriveWeekFieldsFromWods(weekEntry.week_number, nextWods)
    return {
      ...weekEntry,
      ...weekFields,
    }
  })
}

const addExerciseIdsToWeekPlan = (durationValue, currentPlan, weekNumber, exerciseIdsToAdd, targetWodKey = "") => {
  const normalizedWeek = Number(weekNumber)
  const normalizedTargetWodKey = String(targetWodKey || "")
  const normalizedIds = (Array.isArray(exerciseIdsToAdd) ? exerciseIdsToAdd : [])
    .map((exerciseId) => Number(exerciseId))
    .filter((exerciseId) => Number.isFinite(exerciseId))

  if (!Number.isFinite(normalizedWeek) || normalizedWeek < 1 || normalizedIds.length === 0) {
    return buildWorkoutPlanForDuration(durationValue, currentPlan)
  }

  return buildWorkoutPlanForDuration(durationValue, currentPlan).map((weekEntry) => {
    if (weekEntry.week_number !== normalizedWeek) return weekEntry
    const existingWods = buildWodsFromWeekEntry(weekEntry)
    const fallbackWod = normalizeWodEntry({ key: buildWodKey(weekEntry.week_number, 0), title: "WOD 1" }, weekEntry.week_number, 0)
    const targetWod = existingWods.find((wodEntry) => String(wodEntry.key) === normalizedTargetWodKey) ?? existingWods[0] ?? fallbackWod
    const nextWods = (existingWods.length > 0 ? existingWods : [fallbackWod]).map((wodEntry) => {
      if (String(wodEntry.key) !== String(targetWod.key)) return wodEntry
      const nextEntries = mergePlanExerciseEntries([
        ...wodEntry.exercise_entries,
        ...normalizedIds.map((exercise_id) => ({ exercise_id })),
      ])
      return normalizeWodEntry({ ...wodEntry, exercise_entries: nextEntries, is_rest: false }, weekEntry.week_number, 0)
    })
    const weekFields = deriveWeekFieldsFromWods(weekEntry.week_number, nextWods)
    return {
      ...weekEntry,
      ...weekFields,
    }
  })
}

const removeExerciseIdFromWeekPlan = (durationValue, currentPlan, weekNumber, wodKey, exerciseIdToRemove) => {
  const normalizedWeek = Number(weekNumber)
  const normalizedWodKey = String(wodKey || "")
  const normalizedExerciseId = Number(exerciseIdToRemove)

  if (!Number.isFinite(normalizedWeek) || normalizedWeek < 1 || !normalizedWodKey || !Number.isFinite(normalizedExerciseId)) {
    return buildWorkoutPlanForDuration(durationValue, currentPlan)
  }

  return buildWorkoutPlanForDuration(durationValue, currentPlan).map((weekEntry) => {
    if (weekEntry.week_number !== normalizedWeek) return weekEntry
    const nextWods = buildWodsFromWeekEntry(weekEntry).map((wodEntry) => {
      if (String(wodEntry.key) !== normalizedWodKey) return wodEntry
      return normalizeWodEntry(
        {
          ...wodEntry,
          exercise_entries: wodEntry.exercise_entries.filter(
            (entry) => Number(entry.exercise_id) !== normalizedExerciseId,
          ),
        },
        weekEntry.week_number,
        0,
      )
    })
    const weekFields = deriveWeekFieldsFromWods(weekEntry.week_number, nextWods)
    return {
      ...weekEntry,
      ...weekFields,
    }
  })
}

const reorderExerciseInWeekPlan = (durationValue, currentPlan, weekNumber, wodKey, exerciseId, direction) => {
  const normalizedWeek = Number(weekNumber)
  const normalizedWodKey = String(wodKey || "")
  const normalizedExerciseId = Number(exerciseId)
  const offset = direction === "up" ? -1 : direction === "down" ? 1 : 0
  if (!Number.isFinite(normalizedWeek) || normalizedWeek < 1 || !normalizedWodKey || !Number.isFinite(normalizedExerciseId) || offset === 0) {
    return buildWorkoutPlanForDuration(durationValue, currentPlan)
  }

  return buildWorkoutPlanForDuration(durationValue, currentPlan).map((weekEntry) => {
    if (weekEntry.week_number !== normalizedWeek) return weekEntry
    const nextWods = buildWodsFromWeekEntry(weekEntry).map((wodEntry) => {
      if (String(wodEntry.key) !== normalizedWodKey) return wodEntry
      const entries = [...wodEntry.exercise_entries]
      const currentIndex = entries.findIndex((entry) => Number(entry.exercise_id) === normalizedExerciseId)
      if (currentIndex < 0) return wodEntry
      const targetIndex = currentIndex + offset
      if (targetIndex < 0 || targetIndex >= entries.length) return wodEntry
      const [movedEntry] = entries.splice(currentIndex, 1)
      entries.splice(targetIndex, 0, movedEntry)
      return normalizeWodEntry({ ...wodEntry, exercise_entries: entries }, weekEntry.week_number, 0)
    })
    const weekFields = deriveWeekFieldsFromWods(weekEntry.week_number, nextWods)
    return {
      ...weekEntry,
      ...weekFields,
    }
  })
}

const updateExerciseEntryInWeekPlan = (durationValue, currentPlan, weekNumber, wodKey, exerciseId, fieldName, fieldValue) => {
  const normalizedWeek = Number(weekNumber)
  const normalizedWodKey = String(wodKey || "")
  const normalizedExerciseId = Number(exerciseId)
  if (!["set_number", "reps", "time_seconds"].includes(fieldName)) {
    return buildWorkoutPlanForDuration(durationValue, currentPlan)
  }

  if (!Number.isFinite(normalizedWeek) || normalizedWeek < 1 || !normalizedWodKey || !Number.isFinite(normalizedExerciseId)) {
    return buildWorkoutPlanForDuration(durationValue, currentPlan)
  }

  const normalizedFieldValue = toPositiveIntegerOrNull(fieldValue)

  return buildWorkoutPlanForDuration(durationValue, currentPlan).map((weekEntry) => {
    if (weekEntry.week_number !== normalizedWeek) return weekEntry

    const nextWods = buildWodsFromWeekEntry(weekEntry).map((wodEntry) => {
      if (String(wodEntry.key) !== normalizedWodKey) return wodEntry
      const nextEntries = wodEntry.exercise_entries.map((entry) => {
        if (Number(entry.exercise_id) !== normalizedExerciseId) return entry
        const nextEntry = { ...entry }
        if (normalizedFieldValue) {
          nextEntry[fieldName] = normalizedFieldValue
        } else {
          delete nextEntry[fieldName]
        }
        return nextEntry
      })
      return normalizeWodEntry({ ...wodEntry, exercise_entries: nextEntries }, weekEntry.week_number, 0)
    })

    const weekFields = deriveWeekFieldsFromWods(weekEntry.week_number, nextWods)
    return {
      ...weekEntry,
      ...weekFields,
    }
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

        const mappedWods = Array.isArray(entry?.wods)
          ? entry.wods.map((wodEntry, index) => normalizeWodEntry(wodEntry, weekNumber, index))
          : []
        const explicitEntries = mergePlanExerciseEntries(
          mappedWods.length > 0
            ? mappedWods.flatMap((wodEntry) => wodEntry.exercise_entries)
            : [
              ...(Array.isArray(entry?.exercise_entries) ? entry.exercise_entries : []),
              ...(Array.isArray(entry?.exercises) ? entry.exercises : []),
            ],
        )
        const explicitIds = extractExerciseIds(entry?.exercise_ids)
        const fromExercises = extractExerciseIds(entry?.exercises)
        const fallbackEntries = [...new Set([...explicitIds, ...fromExercises])]
          .map((exerciseId) => normalizePlanExerciseEntry({ exercise_id: exerciseId }))
          .filter(Boolean)
        const exerciseEntries = mergePlanExerciseEntries([...explicitEntries, ...fallbackEntries])
        const nextWods =
          mappedWods.length > 0
            ? mappedWods
            : [normalizeWodEntry({ title: "WOD 1", exercise_entries: exerciseEntries }, weekNumber, 0)]
        const weekFields = deriveWeekFieldsFromWods(weekNumber, nextWods)
        return {
          week_number: weekNumber,
          ...weekFields,
        }
      })
      .filter(Boolean)
    : []

  const mappedFromExercises = Array.isArray(program.exercises)
    ? program.exercises.reduce((accumulator, entry) => {
      const normalizedEntry = normalizePlanExerciseEntry(entry)
      const exerciseId = normalizedEntry?.exercise_id ?? toExerciseId(entry?.id ?? entry?.exercise_id ?? entry)
      if (!exerciseId) return accumulator
      const weekNumber = Number(entry?.week_number ?? entry?.week ?? entry?.weekNumber)
      const targetWeek = Number.isFinite(weekNumber) && weekNumber > 0 ? weekNumber : 1
      if (!accumulator[targetWeek]) {
        accumulator[targetWeek] = []
      }
      accumulator[targetWeek].push(normalizedEntry ?? { exercise_id: exerciseId })
      return accumulator
    }, {})
    : {}

  const mappedFromExercisesList = Object.entries(mappedFromExercises).map(([week, entries]) => {
    const weekNumber = Number(week)
    const exerciseEntries = mergePlanExerciseEntries(entries)
    const weekFields = deriveWeekFieldsFromWods(weekNumber, [
      { key: buildWodKey(weekNumber, 0), title: "WOD 1", exercise_entries: exerciseEntries, is_rest: false },
    ])
    return {
      week_number: weekNumber,
      ...weekFields,
    }
  })

  const mergedPlan = [...mappedFromWorkoutPlan, ...mappedFromExercisesList]
  if (mergedPlan.length === 0) return []

  const mergedByWeek = mergedPlan.reduce((accumulator, entry) => {
    if (!accumulator[entry.week_number]) {
      accumulator[entry.week_number] = []
    }
    accumulator[entry.week_number].push(...buildWodsFromWeekEntry(entry))
    return accumulator
  }, {})

  const normalizedPlan = Object.entries(mergedByWeek)
    .map(([week, wods]) => {
      const weekNumber = Number(week)
      const weekFields = deriveWeekFieldsFromWods(weekNumber, wods)
      return {
        week_number: weekNumber,
        ...weekFields,
      }
    })
    .sort((a, b) => a.week_number - b.week_number)

  const durationWeeks = normalizeDurationWeeks(program.duration_weeks)
  if (durationWeeks > 0) {
    return buildWorkoutPlanForDuration(durationWeeks, normalizedPlan)
  }

  return normalizedPlan
}

const formatExercisePlanMeta = (exerciseEntry) => {
  if (!exerciseEntry || typeof exerciseEntry !== "object") return ""

  const setNumber = toPositiveIntegerOrNull(exerciseEntry.set_number)
  const reps = toPositiveIntegerOrNull(exerciseEntry.reps)
  const timeSeconds = toPositiveIntegerOrNull(exerciseEntry.time_seconds)
  const parts = []

  if (setNumber) parts.push(`${setNumber} set${setNumber === 1 ? "" : "s"}`)
  if (reps) parts.push(`${reps} rep${reps === 1 ? "" : "s"}`)
  if (timeSeconds) parts.push(`${timeSeconds}s`)
  if (parts.length === 0) return ""
  return ` (${parts.join(" • ")})`
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
  title: String(program?.title ?? program?.name ?? ""),
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

const normalizeExerciseEntry = (entry) => {
  if (!entry) return null
  if (typeof entry === "object" && !Array.isArray(entry)) {
    return {
      id: entry.id ?? entry.exercise_id ?? entry.pk ?? null,
      name: String(entry.name ?? entry.title ?? "").trim(),
    }
  }
  return { id: null, name: String(entry ?? "").trim() }
}

const normalizeExercisesPayload = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeExerciseEntry(entry)).filter(Boolean)
  }
  if (value && typeof value === "object") {
    const nestedCandidates = [
      value.value,
      value.target?.value,
      value.exercise,
      value.exercises,
      value.exercise_ids,
      value.exercise_values,
      value.exercise_required,
    ]
      .filter((entry) => entry !== undefined && entry !== null)
      .flatMap((entry) => normalizeExercisesPayload(entry))
    return nestedCandidates
  }

  return normalizeExerciseEntry(value)
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

function capitalizeFirstLetter(str) {
  if (!str) return ''; // Handle empty strings safely
  return str.charAt(0).toUpperCase() + str.slice(1);
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

function Programs({
  programs = [],
  userSession,
  handleFilterChange = () => { },
  isChoicesLoading = false,
  exerciseLibraryState,
  setExerciseLibraryState = () => { },
  filters,
  setFilters = () => { },
  currentPage = 1,
  setCurrentPage = () => { },
  sortOrder = "asc",
  goalChoices = [],
  difficultyChoices = [],
  categoryChoices = [],
  equipmentChoices = [],
  muscleChoices = [],
  setIsChoicesLoading = () => { },
  isProgramsLoading,
  programsErrorMessage,
  programExercises,
  isCreateModalOpen,
  searchParams,
  setSearchParams,
  exerciseIsAdded = [],
  setExerciseIsAdded = () => { },
}) {
  const currentUsername = userSession?.username ?? ""
  const currentUserId = userSession?.userId ?? null
  const [searchName, setSearchName] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const resolvedFilters = filters ?? { difficulty: [], category: [], equipment: [] }
  const resolvedExerciseLibraryState = exerciseLibraryState ?? {
    exerciseLibrary: [],
    isExerciseLibraryLoading: false,
    exerciseLibraryError: "",
  }
  const {
    exerciseLibrary = [],
    isExerciseLibraryLoading = false,
    exerciseLibraryError = "",
  } = resolvedExerciseLibraryState

  const programFormContext = useProgramForm()
  const {
    clearDraft = () => { },
  } = programFormContext ?? {}
  const [successMessage, setSuccessMessage] = useState("")
  const [createFormValues, setCreateFormValues] = useState(EMPTY_PROGRAM_FORM_VALUES)
  const [createFieldErrors, setCreateFieldErrors] = useState({})
  const [createErrorMessage, setCreateErrorMessage] = useState("")
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false)
  const [workouts, setWorkouts] = useState(() => getStoredWorkouts())
  const [createPlanWeek, setCreatePlanWeek] = useState(1)
  const [createPlanWodKey, setCreatePlanWodKey] = useState("")
  const [createPlanWodTitle, setCreatePlanWodTitle] = useState("")
  const [createPlanWodIsRest, setCreatePlanWodIsRest] = useState(false)
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
  const [detailPlanWodKey, setDetailPlanWodKey] = useState("")
  const [detailPlanWorkoutId, setDetailPlanWorkoutId] = useState("")
  const [durationRange, setDurationRange] = useState({ min: DEFAULT_DURATION_MIN, max: DEFAULT_DURATION_MAX })
  // Schedule-to-calendar state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [scheduleStartDate, setScheduleStartDate] = useState("")
  const [scheduleError, setScheduleError] = useState("")
  const [scheduleSuccess, setScheduleSuccess] = useState("")
  const [visibleProgramsCount, setVisibleProgramsCount] = useState(PAGE_SIZE)
  const [hasHydratedCreateDraft, setHasHydratedCreateDraft] = useState(false)
  
  
  const openCreateModal = () => setSearchParams({ newProgram: "true" })

  const closeCreateModal = () => {
    setSearchParams({})
    clearDraft()
  }

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
  }, [searchName, sortOrder, filters])




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
    console.log("goalChoices: ", goalChoices)
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
  console.log("goals: ", goals)

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
  const selectedCreateWeekEntry = workoutPlan.find((entry) => Number(entry.week_number) === Number(createPlanWeek)) ?? null
  const selectedCreateWeekWods = selectedCreateWeekEntry ? buildWodsFromWeekEntry(selectedCreateWeekEntry) : []
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
  const selectedDetailWeekEntry = detailsWorkoutPlan.find((entry) => Number(entry.week_number) === Number(detailPlanWeek)) ?? null
  const selectedDetailWeekWods = selectedDetailWeekEntry ? buildWodsFromWeekEntry(selectedDetailWeekEntry) : []
  const createEquipmentSelection = Array.isArray(createFormValues.equipment) ? createFormValues.equipment : []
  const editEquipmentSelection = Array.isArray(editFormValues.equipment) ? editFormValues.equipment : []
  const createEquipmentValues = normalizeEquipmentValues(createFormValues.equipment)
  const editEquipmentValues = normalizeEquipmentValues(editFormValues.equipment)
  const filterCategoryValues = Array.isArray(resolvedFilters.category) ? resolvedFilters.category : []
  const filterEquipmentValues = Array.isArray(resolvedFilters.equipment) ? resolvedFilters.equipment : []
  const filterDifficultyValues = Array.isArray(resolvedFilters.difficulty) ? resolvedFilters.difficulty : []

  useEffect(() => {
    if (selectedCreateWeekWods.length === 0) {
      setCreatePlanWodKey("")
      return
    }
    if (selectedCreateWeekWods.some((wodEntry) => String(wodEntry.key) === String(createPlanWodKey))) {
      return
    }
    setCreatePlanWodKey(String(selectedCreateWeekWods[0].key))
  }, [selectedCreateWeekWods, createPlanWodKey])

  useEffect(() => {
    if (selectedDetailWeekWods.length === 0) {
      setDetailPlanWodKey("")
      return
    }
    if (selectedDetailWeekWods.some((wodEntry) => String(wodEntry.key) === String(detailPlanWodKey))) {
      return
    }
    setDetailPlanWodKey(String(selectedDetailWeekWods[0].key))
  }, [selectedDetailWeekWods, detailPlanWodKey])

  const filteredAndSortedProgramsLibrary = useMemo(() => {
    let result = [...programs]
    console.log("result", result)

    if (searchName.trim()) {
      const query = searchName.trim().toLowerCase()
      result = result.filter((program) => {
        const name = String(program?.name ?? program?.title ?? "").toLowerCase()
        const description = String(program?.description ?? "").toLowerCase()
        return name.includes(query) || description.includes(query)
      })
    }

    if (filterDifficultyValues.length > 0) {
      result = result.filter((program) => filterDifficultyValues.includes(program?.difficulty))
    }

    if (filterCategoryValues.length > 0) {
      result = result.filter((program) => filterCategoryValues.includes(program?.category))
    }

    if (filterEquipmentValues.length > 0) {
      result = result.filter((program) => {
        const values = canonicalizeEquipmentValues(getProgramEquipmentValues(program), equipmentChoices)
        return filterEquipmentValues.some((equipmentValue) => values.includes(equipmentValue))
      })
    }

    result.sort((left, right) => {
      const leftName = String(left?.name ?? left?.title ?? "").toLowerCase()
      const rightName = String(right?.name ?? right?.title ?? "").toLowerCase()
      return sortOrder === "desc" ? rightName.localeCompare(leftName) : leftName.localeCompare(rightName)
    })

    return result
  }, [programs, searchName, sortOrder, filterDifficultyValues, filterCategoryValues, filterEquipmentValues, equipmentChoices])

  useEffect(() => {
    setVisibleProgramsCount(PAGE_SIZE)
  }, [filteredAndSortedProgramsLibrary.length, sortOrder, resolvedFilters.searchName, resolvedFilters.category, resolvedFilters.equipment, resolvedFilters.difficulty, resolvedFilters.target])

  const visiblePrograms = useMemo(
    () => filteredAndSortedProgramsLibrary.slice(0, visibleProgramsCount),
    [filteredAndSortedProgramsLibrary, visibleProgramsCount],
  )

  const hasMoreVisiblePrograms = visibleProgramsCount < filteredAndSortedProgramsLibrary.length

  const handleLoadMorePrograms = () => {
    setVisibleProgramsCount((previousCount) => previousCount + PAGE_SIZE)
  }


  const filterEquipmentOptions = equipments
  const filterCategoryOptions = categories
  const selectedProgramDetails = selectedProgramId ? programDetailsById[selectedProgramId] : null
  const selectedProgramOwner =
    selectedProgramDetails?.created_by_username ||
    selectedProgramDetails?.username ||
    selectedProgramDetails?.created_by ||
    selectedProgram?.created_by_username ||
    selectedProgram?.username ||
    selectedProgram?.created_by ||
    ""
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
    setFilters({ difficulty: [], category: [], equipment: [] })
    setCurrentPage(1)
  }

  const handleOpenCreateModal = () => {
    clearCreateProgramDraft()
    setCreateFormValues(EMPTY_PROGRAM_FORM_VALUES)
    setCreateFieldErrors({})
    setCreateErrorMessage("")
    setExerciseIsAdded([])
    setCreatePlanWeek(1)
    setCreatePlanWodKey("")
    setCreatePlanWodTitle("")
    setCreatePlanWodIsRest(false)
    setEditImageFile(null)
    setEditImagePreview("")
    if (editImageInputRef.current) {
      editImageInputRef.current.value = ""
    }
    setHasHydratedCreateDraft(true)
    openCreateModal()
  }


  const handleCloseCreateModal = () => {
    clearCreateProgramDraft()
    setEditImageFile(null)
    setEditImagePreview("")
    setExerciseIsAdded([])
    setCreatePlanWodKey("")
    setCreatePlanWodTitle("")
    setCreatePlanWodIsRest(false)
    if (editImageInputRef.current) {
      editImageInputRef.current.value = ""
    }
    setHasHydratedCreateDraft(false)
    closeCreateModal()
  }

  useEffect(() => {
    if (!isCreateModalOpen || hasHydratedCreateDraft) {
      return
    }

    const storedDraft = loadCreateProgramDraft()
    if (storedDraft?.createFormValues && typeof storedDraft.createFormValues === "object") {
      setCreateFormValues((previousValues) => ({
        ...previousValues,
        ...storedDraft.createFormValues,
      }))
    }
    if (Number.isFinite(Number(storedDraft?.createPlanWeek))) {
      setCreatePlanWeek(Number(storedDraft.createPlanWeek))
    }
    if (typeof storedDraft?.createPlanWodKey === "string") {
      setCreatePlanWodKey(storedDraft.createPlanWodKey)
    }

    setHasHydratedCreateDraft(true)
  }, [isCreateModalOpen, hasHydratedCreateDraft])

  useEffect(() => {
    if (!isCreateModalOpen || !hasHydratedCreateDraft) {
      return
    }

    saveCreateProgramDraft({
      createFormValues,
      createPlanWeek,
      createPlanWodKey,
    })
  }, [isCreateModalOpen, hasHydratedCreateDraft, createFormValues, createPlanWeek, createPlanWodKey])

  const handleOpenExercisePicker = () => {
    saveCreateProgramDraft({
      createFormValues,
      createPlanWeek,
      createPlanWodKey,
    })
  }

  useEffect(() => {
    if (!isCreateModalOpen) {
      return
    }

    const selectedIds = Array.isArray(exerciseIsAdded)
      ? exerciseIsAdded
        .map((exerciseId) => Number(exerciseId))
        .filter((exerciseId) => Number.isFinite(exerciseId))
      : []
    if (selectedIds.length === 0) {
      return
    }

    const rawWeek = Number(searchParams?.get("planWeek") || createPlanWeek || 1)
    const weekNumber = Number.isFinite(rawWeek) && rawWeek > 0 ? rawWeek : 1

    setCreateFormValues((prev) => {
      const targetWodKey = String(createPlanWodKey || searchParams?.get("planWodKey") || "")
      const nextPlan = addExerciseIdsToWeekPlan(prev.duration_weeks, prev.workout_plan, weekNumber, selectedIds, targetWodKey)
      return { ...prev, workout_plan: nextPlan }
    })
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
    setCreatePlanWeek(weekNumber)
    setExerciseIsAdded([])

    if (searchParams?.get("applyAddedExercises") === "true" || searchParams?.get("planWeek") || searchParams?.get("planWodKey")) {
      setSearchParams({ newProgram: "true" })
    }
  }, [isCreateModalOpen, searchParams, setSearchParams, exerciseIsAdded, setExerciseIsAdded, createPlanWeek, createPlanWodKey])

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

  const handleUpdateCreateWeekExerciseMeta = (weekNumber, wodKey, exerciseId, fieldName, value) => {
    setCreateFormValues((prev) => ({
      ...prev,
      workout_plan: updateExerciseEntryInWeekPlan(
        prev.duration_weeks,
        prev.workout_plan,
        weekNumber,
        wodKey,
        exerciseId,
        fieldName,
        value,
      ),
    }))
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
  }

  const handleAddWodToCreateWeek = () => {
    const weekNumber = Number(createPlanWeek)
    if (!Number.isFinite(weekNumber) || weekNumber < 1) return
    setCreateFormValues((prev) => ({
      ...prev,
      workout_plan: addWodToWeekPlan(prev.duration_weeks, prev.workout_plan, weekNumber, {
        title: createPlanWodTitle,
        is_rest: createPlanWodIsRest,
      }),
    }))
    setCreatePlanWodTitle("")
    setCreatePlanWodIsRest(false)
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
  }

  const handleUpdateCreateWod = (weekNumber, wodKey, updates) => {
    setCreateFormValues((prev) => ({
      ...prev,
      workout_plan: updateWodInWeekPlan(prev.duration_weeks, prev.workout_plan, weekNumber, wodKey, updates),
    }))
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
  }

  const handleReorderCreateWod = (weekNumber, wodKey, direction) => {
    setCreateFormValues((prev) => ({
      ...prev,
      workout_plan: reorderWodInWeekPlan(prev.duration_weeks, prev.workout_plan, weekNumber, wodKey, direction),
    }))
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
  }

  const handleRemoveWodFromCreateWeek = (weekNumber, wodKey) => {
    setCreateFormValues((prev) => ({
      ...prev,
      workout_plan: removeWodFromWeekPlan(prev.duration_weeks, prev.workout_plan, weekNumber, wodKey),
    }))
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
    setCreatePlanWodKey((prevWodKey) => (prevWodKey === wodKey ? "" : prevWodKey))
  }

  const handleReorderCreateExercise = (weekNumber, wodKey, exerciseId, direction) => {
    setCreateFormValues((prev) => ({
      ...prev,
      workout_plan: reorderExerciseInWeekPlan(prev.duration_weeks, prev.workout_plan, weekNumber, wodKey, exerciseId, direction),
    }))
    setCreateFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
  }

  const handleRemoveExerciseFromWorkoutWeek = (weekNumber, wodKey, exerciseId) => {
    setCreateFormValues((prev) => {
      const nextPlan = removeExerciseIdFromWeekPlan(prev.duration_weeks, prev.workout_plan, weekNumber, wodKey, exerciseId)
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
        name: createFormValues.title.trim(),
        description: createFormValues.description.trim(),
        difficulty: createFormValues.difficulty,
        duration_weeks: Number(createFormValues.duration_weeks),
        is_public: Boolean(createFormValues.is_public),
        exercises: selectedExerciseIds,
        items: buildProgramItemsFromWorkoutPlan(normalizedWorkoutPlan),
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
              : canonicalizeEquipmentValues(createFormValues.equipment, equipmentChoices),
        }
        : null

      if (createdProgramWithPlan && createdProgramWithPlan.id) {
        setPrograms((prev) => [createdProgramWithPlan, ...prev])
      }

      setIsCreateModalOpen(false)
      clearCreateProgramDraft()
      setCreateFormValues(EMPTY_PROGRAM_FORM_VALUES)
      setCreateFieldErrors({})
      setCreatePlanWeek(1)
      setCreatePlanWodKey("")
      setCreatePlanWodTitle("")
      setCreatePlanWodIsRest(false)
      setHasHydratedCreateDraft(false)
    } catch (error) {
      const fieldErrors = {}
      const responseData = error?.response?.data
      if (responseData && typeof responseData === "object") {
        const knownFields = [
          "name",
          "description",
          "difficulty",
          "duration_weeks",
          "is_public",
          "items",
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
    setDetailPlanWodKey("")
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
      setDetailPlanWodKey("")
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
      setDetailPlanWodKey("")
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
    setDetailPlanWodKey("")
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
        name: editFormValues.title.trim(),
        description: editFormValues.description.trim(),
        difficulty: editFormValues.difficulty,
        duration_weeks: Number(editFormValues.duration_weeks),
        is_public: Boolean(editFormValues.is_public),
        exercises: selectedExerciseIds,
        items: buildProgramItemsFromWorkoutPlan(normalizedDetailWorkoutPlan),
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
                  : canonicalizeEquipmentValues(editFormValues.equipment, equipmentChoices),
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
              : canonicalizeEquipmentValues(editFormValues.equipment, equipmentChoices),
        },
      }))
      handleCloseDetailsModal()
    } catch (error) {
      const fieldErrors = {}
      const responseData = error?.response?.data
      if (responseData && typeof responseData === "object") {
        const knownFields = [
          "name",
          "description",
          "difficulty",
          "duration_weeks",
          "is_public",
          "items",
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

  const handleUpdateDetailWeekExerciseMeta = (weekNumber, wodKey, exerciseId, fieldName, value) => {
    setDetailWorkoutPlan((prev) =>
      updateExerciseEntryInWeekPlan(editFormValues.duration_weeks, prev, weekNumber, wodKey, exerciseId, fieldName, value),
    )
    setEditFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
  }

  const handleReorderDetailWod = (weekNumber, wodKey, direction) => {
    if (!isDetailsEditMode || !canEditSelectedProgram) return
    setDetailWorkoutPlan((prev) =>
      reorderWodInWeekPlan(editFormValues.duration_weeks, prev, weekNumber, wodKey, direction),
    )
    setEditFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
  }

  const handleReorderDetailExercise = (weekNumber, wodKey, exerciseId, direction) => {
    if (!isDetailsEditMode || !canEditSelectedProgram) return
    setDetailWorkoutPlan((prev) =>
      reorderExerciseInWeekPlan(editFormValues.duration_weeks, prev, weekNumber, wodKey, exerciseId, direction),
    )
    setEditFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
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
      const durationValue = totalWeeks > 0 ? totalWeeks : prev.length
      return addExerciseIdsToWeekPlan(durationValue, prev, weekNumber, workoutExerciseIds, detailPlanWodKey)
    })
    setEditFieldErrors((prev) => ({ ...prev, workout_plan: "" }))
    setDetailPlanWorkoutId("")
  }

  const handleRemoveExerciseFromDetailWeek = (weekNumber, wodKey, exerciseId) => {
    if (!isDetailsEditMode || !canEditSelectedProgram) return

    setDetailWorkoutPlan((prev) =>
      removeExerciseIdFromWeekPlan(editFormValues.duration_weeks, prev, weekNumber, wodKey, exerciseId),
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
    setDetailPlanWodKey("")
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
                    checked={filterDifficultyValues.includes(d.value)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...filterDifficultyValues, d.value]
                        : filterDifficultyValues.filter((v) => v !== d.value)
                      handleFilterChange("difficulty", next)
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
              options={filterCategoryOptions}
              value={filterCategoryValues}
              onChange={(selected) => handleFilterChange("category", selected)}
              name="filter-category"
            />
          </div>

          <div className="programs-filter-group">
            <span className="programs-filter-label">Equipment</span>
            <MultiSelect
              options={filterEquipmentOptions}
              value={filterEquipmentValues}
              onChange={(selected) => handleFilterChange("equipment", selected)}
              name="filter-equipment"
              emitOptionObjects
            />
          </div>



          <p className="programs-results-count" aria-live="polite">
            {filteredAndSortedProgramsLibrary.length} program{filteredAndSortedProgramsLibrary.length !== 1 ? "s" : ""} found
          </p>
        </aside>

        <section className="programs-main">
          {isProgramsLoading ? (
            <p className="exercise-loading-note" role="status">Still loading programs. Thanks for hanging tight.</p>
          ) : null}
          {programsErrorMessage ? <p className="exercise-error" role="alert">{programsErrorMessage}</p> : null}
          {successMessage ? <p className="exercise-success" role="status">{successMessage}</p> : null}

          <div
            className="exercise-list"
            role={!isProgramsLoading && filteredAndSortedProgramsLibrary.length > 0 ? "listbox" : undefined}
            aria-label={!isProgramsLoading && filteredAndSortedProgramsLibrary.length > 0 ? "Programs" : undefined}
            aria-busy={isProgramsLoading}
          >
            {console.log("isProgramsLoading:", isProgramsLoading, "filteredAndSortedProgramsLibrary.length:", filteredAndSortedProgramsLibrary.length)}
            {isProgramsLoading ? (
              Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
                <div className="exercise-item exercise-item-skeleton" key={`exercise-skeleton-${index}`} aria-hidden="true">
                  <div className="exercise-skeleton exercise-skeleton-title" />
                  <div className="exercise-skeleton exercise-skeleton-line" />
                  <div className="exercise-skeleton exercise-skeleton-line exercise-skeleton-line-short" />
                  <div className="exercise-skeleton exercise-skeleton-line" />
                </div>
              ))
            ) : filteredAndSortedProgramsLibrary.length === 0 ? (
              <p className="exercise-empty" role="status">No programs found.</p>
            ) : (
              visiblePrograms.map((program, index) => {
                console.log("Rendering program:", program)
                const programImageUrl = String(getProgramImageUrl(program))
                return (
                  <article
                    className={`exercise-item ${(program.id ?? null) === selectedProgramId ? "exercise-item-selected" : ""}`}
                    key={program.id ?? index}
                    id={program.id ? `exercise-option-${program.id}` : undefined}
                    role="option"
                    aria-selected={(program.id ?? null) === selectedProgramId}
                    tabIndex={(program.id ?? null) === selectedProgramId ? 0 : -1}
                    onClick={() => handleOpenProgramDetailsModal(program.id ?? null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        handleOpenProgramDetailsModal(program.id ?? null)
                      }
                    }}
                  >
                    {programImageUrl ? (
                      <div className="exercise-card-image-wrap" aria-hidden="true">
                        <img
                          src={programImageUrl}
                          alt=""
                          loading="lazy"
                          className="exercise-card-image"
                          onError={(event) => {
                            event.currentTarget.style.display = "none"
                          }}
                        />
                      </div>
                    ) : null}
                    <div className="exercise-item-content">
                      <h3 className="exercise-header-title">{(program.title || program.name || "Program").toUpperCase()}</h3>
                      <div className="exercise-header">
                        <p className="exercise-meta"><strong>Visibility:</strong> {capitalizeFirstLetter(program.is_public ? "Public" : "Private")}</p>
                        <p className="exercise-meta"><strong>Category:</strong> {capitalizeFirstLetter(program.category)}</p>
                        <p className="exercise-meta">
                          <strong>Primary Muscle:</strong> {capitalizeFirstLetter(program.primary_muscle_group)}
                        </p>
                        <p className="exercise-meta">
                          <strong>Created by:</strong> {program.created_by_username || program.username || program.created_by || "Unknown"}
                        </p>
                      </div>
                    </div>
                  </article>
                )
              })
            )}
          </div>
          {!isProgramsLoading && hasMoreVisiblePrograms ? (
            <div className="exercise-search-actions">
              <button type="button" className="exercise-secondary-btn" onClick={handleLoadMorePrograms}>
                Load More
              </button>
            </div>
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
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
                  Create WODs per week, mark rest WODs when needed, then browse and add exercises to the selected WOD.
                </p>
                {createFieldErrors.workout_plan ? <small className="programs-modal-error">{createFieldErrors.workout_plan}</small> : null}

                {isExerciseLibraryLoading ? <p className="programs-plan-helper">Loading exercise library...</p> : null}
                {exerciseLibraryError ? <p className="programs-modal-error">{exerciseLibraryError}</p> : null}

                <div className="programs-plan-controls">
                  <label className="programs-modal-field">
                    <span>Week</span>
                    <select
                      name="create_plan_week"
                      value={String(createPlanWeek)}
                      onChange={(event) => setCreatePlanWeek(Number(event.target.value) || 1)}
                      disabled={workoutPlan.length === 0}
                    >
                      {workoutPlan.length === 0 ? <option value="1">No weeks available</option> : null}
                      {workoutPlan.map((weekEntry) => (
                        <option key={`create-week-${weekEntry.week_number}`} value={weekEntry.week_number}>
                          Week {weekEntry.week_number}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="programs-modal-field">
                    <span>WOD</span>
                    <select
                      name="create_plan_wod"
                      value={createPlanWodKey}
                      onChange={(event) => setCreatePlanWodKey(event.target.value)}
                      disabled={selectedCreateWeekWods.length === 0}
                    >
                      {selectedCreateWeekWods.length === 0 ? <option value="">No WODs in this week</option> : null}
                      {selectedCreateWeekWods.map((wodEntry) => (
                        <option key={wodEntry.key} value={String(wodEntry.key)}>
                          {wodEntry.title}{wodEntry.is_rest ? " (Rest)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="programs-modal-field">
                    <span>New WOD Title</span>
                    <input
                      type="text"
                      value={createPlanWodTitle}
                      onChange={(event) => setCreatePlanWodTitle(event.target.value)}
                      placeholder="Example: Monday Strength"
                      disabled={workoutPlan.length === 0}
                    />
                  </label>

                  <label className="programs-modal-checkbox">
                    <input
                      type="checkbox"
                      checked={createPlanWodIsRest}
                      onChange={(event) => setCreatePlanWodIsRest(event.target.checked)}
                      disabled={workoutPlan.length === 0}
                    />
                    Rest WOD
                  </label>

                  <button
                    type="button"
                    className="programs-modal-secondary-btn programs-plan-add-btn"
                    onClick={handleAddWodToCreateWeek}
                    disabled={workoutPlan.length === 0}
                  >
                    Add WOD to Week
                  </button>

                  <Link
                    to={`/exercises?source=new-program&newProgram=true&planWeek=${createPlanWeek}&planWodKey=${createPlanWodKey}`}
                    className="programs-modal-secondary-btn programs-plan-add-btn"
                    onClick={(event) => {
                      if (!createPlanWodKey) {
                        event.preventDefault()
                        return
                      }
                      handleOpenExercisePicker()
                    }}
                    aria-disabled={!createPlanWodKey}
                  >
                    Browse Exercise Library
                  </Link>
                </div>

                <div className="programs-plan-weeks">
                  {workoutPlan.length === 0 ? (
                    <p className="programs-plan-helper">Enter duration to start building your weekly workout plan.</p>
                  ) : (
                    workoutPlan.map((weekEntry) => (
                      <article key={weekEntry.week_number} className="programs-plan-week-card">
                        <h4>Week {weekEntry.week_number}</h4>
                        {buildWodsFromWeekEntry(weekEntry).length === 0 ? (
                          <p className="programs-plan-helper">No WODs added yet.</p>
                        ) : (
                          buildWodsFromWeekEntry(weekEntry).map((wodEntry, wodIndex) => (
                            <article key={`${weekEntry.week_number}-${wodEntry.key}`} className="programs-plan-week-card">
                              <div className="programs-plan-controls">
                                <label className="programs-modal-field">
                                  <span>WOD Title</span>
                                  <input
                                    type="text"
                                    value={wodEntry.title}
                                    onChange={(event) =>
                                      handleUpdateCreateWod(weekEntry.week_number, wodEntry.key, { title: event.target.value })}
                                  />
                                </label>
                                <label className="programs-modal-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(wodEntry.is_rest)}
                                    onChange={(event) =>
                                      handleUpdateCreateWod(weekEntry.week_number, wodEntry.key, { is_rest: event.target.checked })}
                                  />
                                  Rest
                                </label>
                                <button
                                  type="button"
                                  className="programs-modal-secondary-btn"
                                  onClick={() => handleReorderCreateWod(weekEntry.week_number, wodEntry.key, "up")}
                                  disabled={wodIndex === 0}
                                >
                                  WOD ↑
                                </button>
                                <button
                                  type="button"
                                  className="programs-modal-secondary-btn"
                                  onClick={() => handleReorderCreateWod(weekEntry.week_number, wodEntry.key, "down")}
                                  disabled={wodIndex === buildWodsFromWeekEntry(weekEntry).length - 1}
                                >
                                  WOD ↓
                                </button>
                                <button
                                  type="button"
                                  className="programs-plan-remove-btn"
                                  onClick={() => handleRemoveWodFromCreateWeek(weekEntry.week_number, wodEntry.key)}
                                >
                                  Remove WOD
                                </button>
                              </div>

                              {wodEntry.is_rest ? (
                                <p className="programs-plan-helper">Rest day WOD</p>
                              ) : wodEntry.exercise_entries.length === 0 ? (
                                <p className="programs-plan-helper">No exercises in this WOD yet.</p>
                              ) : (
                                <ul className="programs-plan-exercise-list">
                                  {wodEntry.exercise_entries.map((exerciseEntry, exerciseIndex) => (
                                    <li key={`${weekEntry.week_number}-${wodEntry.key}-${exerciseEntry.exercise_id}`}>
                                      <span>{exerciseNameById[exerciseEntry.exercise_id] || `Exercise #${exerciseEntry.exercise_id}`}</span>
                                      <label className="programs-modal-field">
                                        <span>Sets</span>
                                        <input
                                          type="number"
                                          min="1"
                                          value={exerciseEntry.set_number ?? ""}
                                          onChange={(event) =>
                                            handleUpdateCreateWeekExerciseMeta(
                                              weekEntry.week_number,
                                              wodEntry.key,
                                              exerciseEntry.exercise_id,
                                              "set_number",
                                              event.target.value,
                                            )}
                                          placeholder="Optional"
                                        />
                                      </label>
                                      <label className="programs-modal-field">
                                        <span>Reps</span>
                                        <input
                                          type="number"
                                          min="1"
                                          value={exerciseEntry.reps ?? ""}
                                          onChange={(event) =>
                                            handleUpdateCreateWeekExerciseMeta(
                                              weekEntry.week_number,
                                              wodEntry.key,
                                              exerciseEntry.exercise_id,
                                              "reps",
                                              event.target.value,
                                            )}
                                          placeholder="Optional"
                                        />
                                      </label>
                                      <label className="programs-modal-field">
                                        <span>Time (sec)</span>
                                        <input
                                          type="number"
                                          min="1"
                                          value={exerciseEntry.time_seconds ?? ""}
                                          onChange={(event) =>
                                            handleUpdateCreateWeekExerciseMeta(
                                              weekEntry.week_number,
                                              wodEntry.key,
                                              exerciseEntry.exercise_id,
                                              "time_seconds",
                                              event.target.value,
                                            )}
                                          placeholder="Optional"
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        className="programs-modal-secondary-btn"
                                        onClick={() =>
                                          handleReorderCreateExercise(
                                            weekEntry.week_number,
                                            wodEntry.key,
                                            exerciseEntry.exercise_id,
                                            "up",
                                          )}
                                        disabled={exerciseIndex === 0}
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        className="programs-modal-secondary-btn"
                                        onClick={() =>
                                          handleReorderCreateExercise(
                                            weekEntry.week_number,
                                            wodEntry.key,
                                            exerciseEntry.exercise_id,
                                            "down",
                                          )}
                                        disabled={exerciseIndex === wodEntry.exercise_entries.length - 1}
                                      >
                                        ↓
                                      </button>
                                      <button
                                        type="button"
                                        className="programs-plan-remove-btn"
                                        onClick={() =>
                                          handleRemoveExerciseFromWorkoutWeek(
                                            weekEntry.week_number,
                                            wodEntry.key,
                                            exerciseEntry.exercise_id,
                                          )}
                                        aria-label={`Remove ${exerciseNameById[exerciseEntry.exercise_id] || `exercise ${exerciseEntry.exercise_id}`} from week ${weekEntry.week_number}`}
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
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              {console.log("Selected Program Image URL", { selectedProgramImageUrl })}
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
              {console.log("is loading: ", isProgramsLoading, "has more visible programs: ", hasMoreVisiblePrograms, "visible programs count: ", visibleProgramsCount)}
              {!isProgramsLoading && hasMoreVisiblePrograms ? (
                <div className="exercise-search-actions">
                  <button type="button" className="exercise-secondary-btn" onClick={handleLoadMorePrograms}>
                    Load More
                  </button>
                </div>
              ) : null}

              {isDetailsEditMode || isWorkoutPlanUnlocked ? (
                <section className="programs-plan-builder" aria-label="Workout plan by week">
                  <h3>Workout Plan By Week</h3>
                  <p className="programs-plan-helper">
                    {canEditSelectedProgram && isDetailsEditMode
                      ? "Edit workouts by week and update set/rep/time details for each exercise."
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

                      <label className="programs-modal-field">
                        <span>WOD</span>
                        <select
                          name="details_plan_wod"
                          value={detailPlanWodKey}
                          onChange={(event) => setDetailPlanWodKey(event.target.value)}
                          disabled={selectedDetailWeekWods.length === 0}
                        >
                          {selectedDetailWeekWods.length === 0 ? <option value="">No WODs in this week</option> : null}
                          {selectedDetailWeekWods.map((wodEntry) => (
                            <option key={wodEntry.key} value={String(wodEntry.key)}>
                              {wodEntry.title}{wodEntry.is_rest ? " (Rest)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        className="programs-modal-secondary-btn programs-plan-add-btn"
                        onClick={handleAddSavedWorkoutToDetailWeek}
                        disabled={!detailPlanWorkoutId || !detailPlanWodKey || detailsWorkoutPlan.length === 0}
                      >
                        Add Saved Workout
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
                          {buildWodsFromWeekEntry(weekEntry).length === 0 ? (
                            <p className="programs-plan-helper">No WODs added yet.</p>
                          ) : (
                            buildWodsFromWeekEntry(weekEntry).map((wodEntry, wodIndex) => (
                              <article key={`details-${weekEntry.week_number}-${wodEntry.key}`} className="programs-plan-week-card">
                                <h5>{wodEntry.title}{wodEntry.is_rest ? " (Rest)" : ""}</h5>
                                {canEditSelectedProgram && isDetailsEditMode ? (
                                  <div className="programs-plan-controls">
                                    <button
                                      type="button"
                                      className="programs-modal-secondary-btn"
                                      onClick={() => handleReorderDetailWod(weekEntry.week_number, wodEntry.key, "up")}
                                      disabled={wodIndex === 0}
                                    >
                                      WOD ↑
                                    </button>
                                    <button
                                      type="button"
                                      className="programs-modal-secondary-btn"
                                      onClick={() => handleReorderDetailWod(weekEntry.week_number, wodEntry.key, "down")}
                                      disabled={wodIndex === buildWodsFromWeekEntry(weekEntry).length - 1}
                                    >
                                      WOD ↓
                                    </button>
                                  </div>
                                ) : null}
                                {wodEntry.is_rest ? (
                                  <p className="programs-plan-helper">Rest day WOD</p>
                                ) : wodEntry.exercise_entries.length === 0 ? (
                                  <p className="programs-plan-helper">No exercises added yet.</p>
                                ) : (
                                  <ul className="programs-plan-exercise-list">
                                    {wodEntry.exercise_entries.map((exerciseEntry, exerciseIndex) => (
                                      <li key={`details-${weekEntry.week_number}-${wodEntry.key}-${exerciseEntry.exercise_id}`}>
                                        <span>{exerciseNameById[exerciseEntry.exercise_id] || `Exercise #${exerciseEntry.exercise_id}`}</span>
                                        {canEditSelectedProgram && isDetailsEditMode ? (
                                          <>
                                            <label className="programs-modal-field">
                                              <span>Sets</span>
                                              <input
                                                type="number"
                                                min="1"
                                                value={exerciseEntry.set_number ?? ""}
                                                onChange={(event) =>
                                                  handleUpdateDetailWeekExerciseMeta(
                                                    weekEntry.week_number,
                                                    wodEntry.key,
                                                    exerciseEntry.exercise_id,
                                                    "set_number",
                                                    event.target.value,
                                                  )}
                                                placeholder="Optional"
                                              />
                                            </label>
                                            <label className="programs-modal-field">
                                              <span>Reps</span>
                                              <input
                                                type="number"
                                                min="1"
                                                value={exerciseEntry.reps ?? ""}
                                                onChange={(event) =>
                                                  handleUpdateDetailWeekExerciseMeta(
                                                    weekEntry.week_number,
                                                    wodEntry.key,
                                                    exerciseEntry.exercise_id,
                                                    "reps",
                                                    event.target.value,
                                                  )}
                                                placeholder="Optional"
                                              />
                                            </label>
                                            <label className="programs-modal-field">
                                              <span>Time (sec)</span>
                                              <input
                                                type="number"
                                                min="1"
                                                value={exerciseEntry.time_seconds ?? ""}
                                                onChange={(event) =>
                                                  handleUpdateDetailWeekExerciseMeta(
                                                    weekEntry.week_number,
                                                    wodEntry.key,
                                                    exerciseEntry.exercise_id,
                                                    "time_seconds",
                                                    event.target.value,
                                                  )}
                                                placeholder="Optional"
                                              />
                                            </label>
                                            <button
                                              type="button"
                                              className="programs-modal-secondary-btn"
                                              onClick={() =>
                                                handleReorderDetailExercise(
                                                  weekEntry.week_number,
                                                  wodEntry.key,
                                                  exerciseEntry.exercise_id,
                                                  "up",
                                                )}
                                              disabled={exerciseIndex === 0}
                                            >
                                              ↑
                                            </button>
                                            <button
                                              type="button"
                                              className="programs-modal-secondary-btn"
                                              onClick={() =>
                                                handleReorderDetailExercise(
                                                  weekEntry.week_number,
                                                  wodEntry.key,
                                                  exerciseEntry.exercise_id,
                                                  "down",
                                                )}
                                              disabled={exerciseIndex === wodEntry.exercise_entries.length - 1}
                                            >
                                              ↓
                                            </button>
                                          </>
                                        ) : (
                                          <span>{formatExercisePlanMeta(exerciseEntry)}</span>
                                        )}
                                        {canEditSelectedProgram && isDetailsEditMode ? (
                                          <button
                                            type="button"
                                            className="programs-plan-remove-btn"
                                            onClick={() => handleRemoveExerciseFromDetailWeek(weekEntry.week_number, wodEntry.key, exerciseEntry.exercise_id)}
                                            aria-label={`Remove ${exerciseNameById[exerciseEntry.exercise_id] || `exercise ${exerciseEntry.exercise_id}`} from week ${weekEntry.week_number}`}
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
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
