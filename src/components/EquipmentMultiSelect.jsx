import React, { useState, useRef, useEffect } from "react"

export default function EquipmentMultiSelect({ options, value, onChange, disabled, name }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const selectedValues = Array.isArray(value) ? value : []
  const selectedKeys = selectedValues.map((entry) => String(entry))

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
      onChange(selectedValues.filter((v) => String(v) !== normalizedOptionValue))
    } else {
      onChange([...selectedValues, optionValue])
    }
  }

  const selectedLabels = options
    .filter((opt) => selectedKeys.includes(String(opt.value)))
    .map((opt) => opt.label)

  return (
    <div className="equipment-multiselect-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="equipment-multiselect-toggle"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedLabels.length > 0 ? selectedLabels.join(", ") : "Select equipment"}
        <span className="dropdown-arrow">▾</span>
      </button>
      {open && (
        <div className="equipment-multiselect-list" role="listbox">
          {options.map((option) => (
            <label key={option.value} className="equipment-multiselect-label">
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
