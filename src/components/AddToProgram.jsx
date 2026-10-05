import React from 'react';

function AddToProgram({ isAdded, onToggle, currentExerciseId }) {

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
