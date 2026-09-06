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

  const [availableLang, setAvailableLang] = useState([]); 
  const [selectedLang, setSelectedLang] = useState('default'); 

  useEffect(() => {
    if (availableLang.length > 0) {
      if (availableLang.includes('default')) {
        setSelectedLang('default');
      } else {
        setSelectedLang(availableLang[0]); // Selects the first item if 'default' isn't there
      }
    }
  }, [availableLang]); // This triggers automatically the exact millisecond availableLang updates
    // Guard clause if the instructions object is empty or missing
    if (!availableLang.length) {
      return <p>No instructions available.</p>;
    }

  // Get the array of steps for the currently selected language
  console.log("selectedLang:", selectedLang);
  const currentSteps = instruction_steps[selectedLang] || [];
  console.log("currentSteps:", currentSteps);

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '500px', padding: '16px' }}>
      {/* Dropdown Label */}
      <div className="language-selector">
        <label 
          htmlFor="lang-select" 
          style={{ fontWeight: '500' }}
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
