import { createContext, useContext } from 'react';
export const MotionContext = createContext({
  reduced: false,
  system: false,
});
export const useMotionPreference = () => useContext(MotionContext);
