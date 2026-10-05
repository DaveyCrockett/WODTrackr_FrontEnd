import React, { useState } from 'react';

function AddToProgram({ isAdded, setIsAdded, onToggle, currentExerciseId }) {
  

  const handleAddClick = (event) => {
    event.stopPropagation();
    onToggle(event);
  };

  return (
    <div 
      className={`add-exercise-to-program ${isAdded ? 'added' : ''}`} onClick={(e) => handleAddClick(e)} disabled={!currentExerciseId}
    >
    </div>
  );
}

export default AddToProgram;
