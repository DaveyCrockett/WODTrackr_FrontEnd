import React, { useState, useEffect } from 'react';


const ExerciseSteps = ({ instruction_steps }) => {




  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '500px', padding: '16px' }}>
      {console.log("instruction steps: ", instruction_steps)}
      {/* Ordered List of Steps */}
      <ol style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
        {instruction_steps.map((step, index) => (
          <li key={index} style={{ marginBottom: '10px' }}>
            {step}
          </li>
        )) || <p>No steps available.</p>}
      </ol>
    </div>
  );
};

export default ExerciseSteps;
