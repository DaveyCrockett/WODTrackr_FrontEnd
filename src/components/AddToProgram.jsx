import React, { useState } from 'react';

function AddToProgram({ currentExerciseId, addExerciseToProgram, removeExerciseFromProgram }) {
  const [isAdded, setIsAdded] = useState(false);

  const handleAddClick = () => {
    if (!isAdded) {
      setIsAdded(true);
      addExerciseToProgram(currentExerciseId);
    } else {
      setIsAdded(false);
      removeExerciseFromProgram(currentExerciseId);
    }
  };

  return (
    <div 
      className={`add-exercise-to-program ${isAdded ? 'added' : ''}`} onClick={handleAddClick} disabled={!currentExerciseId}
    >
    </div>
  );
}

export default AddToProgram;
