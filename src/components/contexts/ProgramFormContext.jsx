import React, { createContext, useContext, useState } from 'react';
import { Outlet } from 'react-router-dom'; // Add this import

const ProgramFormContext = createContext();

export const ProgramFormProvider = () => { // Remove { children } prop
  const [programDraft, setProgramDraft] = useState({
    name: '',
    description: '',
    exercises: []
  });

  const updateDraftFields = (fields) => {
    setProgramDraft((prev) => ({ ...prev, ...fields }));
  };

  const addExerciseToDraft = (exercise) => {
    setProgramDraft((prev) => {
      if (prev.exercises.find((e) => e.id === exercise.id)) return prev;
      return { ...prev, exercises: [...prev.exercises, exercise] };
    });
  };

  const clearDraft = () => {
    setProgramDraft({ name: '', description: '', exercises: [] });
  };

  return (
    <ProgramFormContext.Provider value={{ programDraft, updateDraftFields, addExerciseToDraft, clearDraft }}>
      {/* This renders the inner child routes dynamically */}
      <Outlet /> 
    </ProgramFormContext.Provider>
  );
};

export const useProgramForm = () => useContext(ProgramFormContext);
