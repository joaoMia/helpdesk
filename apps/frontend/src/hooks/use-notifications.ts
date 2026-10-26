import { createContext, useContext } from 'react';
export type NoticeTone = 'success' | 'error' | 'warning' | 'info';
export interface Notice {
  id: string;
  tone: NoticeTone;
  message: string;
}
export const NotificationContext = createContext({
  notify: (_tone: NoticeTone, _message: string) => {},
});
export const useNotifications = () => useContext(NotificationContext);
