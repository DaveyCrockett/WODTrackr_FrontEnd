import React, { useState, useRef, useEffect } from "react"

const getComparableValue = (entry) => {
  if (entry && typeof entry === "object") {
    return entry.value ?? entry.id ?? entry.pk ?? entry.key ?? entry.slug ?? entry.code ?? ""
  }
  return entry
}

const toSelectionKey = (entry) => {
  const comparable = getComparableValue(entry)
  if (comparable === null || comparable === undefined) return ""
  return String(comparable).trim()
}

export default function MultiSelect({ options, value, onChange, disabled, name, emitOptionObjects = false }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const selectedValues = Array.isArray(value) ? value : []
  const selectedKeys = selectedValues.map((entry) => toSelectionKey(entry)).filter(Boolean)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    } else {
      document.removeEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  const handleCheckboxChange = (optionValue) => {
    const normalizedOptionValue = toSelectionKey(optionValue)
    if (selectedKeys.includes(normalizedOptionValue)) {
      onChange(selectedValues.filter((entry) => toSelectionKey(entry) !== normalizedOptionValue))
    } else {
      const selectedOption = (Array.isArray(options) ? options : []).find(
        (option) => toSelectionKey(option?.value) === normalizedOptionValue,
      )
      const valueToAppend = emitOptionObjects
        ? {
            value: selectedOption?.value ?? optionValue,
            label: selectedOption?.label ?? String(selectedOption?.value ?? optionValue),
          }
        : optionValue
      onChange([...selectedValues, valueToAppend])
    }
  }

  const optionLabelByKey = new Map(
    (Array.isArray(options) ? options : [])
      .map((opt) => [toSelectionKey(opt?.value), opt?.label])
      .filter(([key]) => Boolean(key)),
  )

  const selectedLabels = selectedValues
    .map((entry) => {
      const key = toSelectionKey(entry)
      if (!key) return ""
      const labelFromOptions = optionLabelByKey.get(key)
      if (labelFromOptions) return String(labelFromOptions)
      if (entry && typeof entry === "object" && entry.label) return String(entry.label)
      return key
    })
    .filter(Boolean)

  return (
    <div className="multiselect-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="multiselect-toggle"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedLabels.length > 0 ? selectedLabels.join(", ") : "Select options"}
        <span className="multiselect-arrow">▾</span>
      </button>
      {open && (
        <div className="multiselect-list" role="listbox">
          {options.map((option) => (
            <label key={option.value} className="multiselect-label">
              <input
                type="checkbox"
                name={name}
                value={option.value}
                checked={selectedKeys.includes(toSelectionKey(option.value))}
                onChange={() => handleCheckboxChange(option.value)}
                disabled={disabled}
              />
              <div className="multiselect-option">{option.label}</div>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}