import React, { useState } from 'react';

// Map language codes to human-readable labels
const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  hi: 'Hindi (हिन्दी)',
  it: 'Italian (Italiano)',
  ko: 'Korean (한국어)',
  pl: 'Polish (Polski)',
  ru: 'Russian (Русский)',
  tr: 'Turkish (Türkçe)'
};

const ExerciseSteps = ({ instruction_steps }) => {
  // Extract available language keys from the object (e.g., ['en', 'es', ...])
  const availableLanguages = Object.keys(instruction_steps || {});
  
  // Set the default language to the first available one, or fallback to 'en'
  const [selectedLang, setSelectedLang] = useState(
    availableLanguages.includes('en') ? 'en' : availableLanguages[0] || ''
  );

  // Guard clause if the instructions object is empty or missing
  if (!availableLanguages.length) {
    return <p>No instructions available.</p>;
  }

  // Get the array of steps for the currently selected language
  console.log("selectedLang:", selectedLang);
  const currentSteps = instruction_steps[selectedLang] || [];
  console.log("currentSteps:", currentSteps);

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '500px', padding: '16px' }}>
      {/* Dropdown Label */}
      <label 
        htmlFor="lang-select" 
        style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}
      >
        Select Language:
      </label>

      {/* Language Selector Dropdown */}
      <select
        id="lang-select"
        value={selectedLang}
        onChange={(e) => setSelectedLang(e.target.value)}
        style={{
          width: '100%',
          padding: '8px',
          borderRadius: '4px',
          border: '1px solid #ccc',
          fontSize: '16px',
          marginBottom: '16px'
        }}
      >
        {availableLanguages.map((langKey) => (
          <option key={langKey} value={langKey}>
            {LANGUAGE_NAMES[langKey] || langKey.toUpperCase()}
          </option>
        ))}
      </select>

      {/* Ordered List of Steps */}
      <ol style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
        {currentSteps.map((step, index) => (
          <li key={index} style={{ marginBottom: '10px' }}>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
};

export default ExerciseSteps;
