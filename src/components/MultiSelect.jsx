import React, { useState, useRef, useEffect } from "react"

const getComparableValue = (entry) => {
  if (entry && typeof entry === "object") {
    return entry.value ?? entry.id ?? entry.pk ?? entry.key ?? entry.slug ?? entry.code ?? ""
  }
  return entry
}

export default function MultiSelect({ options, value, onChange, disabled, name, emitOptionObjects = false }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const selectedValues = Array.isArray(value) ? value : []
  const selectedKeys = selectedValues.map((entry) => String(getComparableValue(entry)))

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
    const normalizedOptionValue = String(optionValue)
    if (selectedKeys.includes(normalizedOptionValue)) {
      onChange(selectedValues.filter((entry) => String(getComparableValue(entry)) !== normalizedOptionValue))
    } else {
      const selectedOption = (Array.isArray(options) ? options : []).find(
        (option) => String(option?.value) === normalizedOptionValue,
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

  const selectedLabels = options
    .filter((opt) => selectedKeys.includes(String(opt.value)))
    .map((opt) => opt.label)

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
                checked={selectedKeys.includes(String(option.value))}
                onChange={() => handleCheckboxChange(option.value)}
                disabled={disabled}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}