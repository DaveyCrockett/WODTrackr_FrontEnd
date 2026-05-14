import React, { useState, useRef, useEffect } from "react"

export default function EquipmentMultiSelect({ options, value, onChange, disabled, name }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

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
    if (!Array.isArray(value)) return
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  const selectedLabels = options.filter(opt => value.includes(opt.value)).map(opt => opt.label)

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
                checked={value.includes(option.value)}
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
