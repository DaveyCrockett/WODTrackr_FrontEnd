import React, { useState, useEffect } from 'react';

// Map language codes to human-readable labels
const LANGUAGE_NAMES = {
  default: '--Select Language--',
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

  const [availableLang, setAvailableLang] = useState(Object.keys(instruction_steps));
  const [selectedLang, setSelectedLang] = useState('default');

  useEffect(() => {
    let keys = Object.keys(instruction_steps); // e.g., ['en', 'es', 'tr', 'default']

    // 🚀 THE FIX: If 'default' exists, pull it out and place it at index 0
    if (keys.includes('default')) {
      keys = ['default', ...keys.filter(key => key !== 'default')];
    }

    setAvailableLang(keys); // Now it's safely ordered: ['default', 'en', 'es', 'tr']

    // Only update selection if current language vanishes
    if (keys.length > 0 && (!selectedLang || !keys.includes(selectedLang))) {
      if (keys.includes('default')) {
        setSelectedLang('default');
      } else {
        setSelectedLang(keys[0]);
      }
    }
  }, [instruction_steps]);


  // Get the array of steps for the currently selected language
  const currentSteps = instruction_steps[selectedLang] || [];

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '500px', padding: '16px' }}>
      {/* Dropdown Label */}
      <div className="language-selector">

        {/* Language Selector Dropdown */}
        <select
          id="lang-select"
          value={selectedLang}
          onChange={(e) => setSelectedLang(e.target.value)}
        >
      
          {/* Map available languages to dropdown options */}
          {availableLang.map((langKey) => (
            <option key={langKey} value={langKey}>
              {LANGUAGE_NAMES[langKey] || langKey.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
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
