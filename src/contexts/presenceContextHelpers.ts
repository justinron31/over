import { createContext, useContext } from "react";

export interface PresenceState {
  [key: string]: boolean;
}

export interface LastSeenState {
  [key: string]: string;
}

export interface PresenceContextType {
  onlineUsers: PresenceState;
  lastSeen: LastSeenState;
  isUserOnline: (userId: string | undefined) => boolean;
  getLastSeen: (userId: string | undefined) => string | null;
}

export const PresenceContext = createContext<PresenceContextType>({
  onlineUsers: {},
  lastSeen: {},
  isUserOnline: () => false,
  getLastSeen: () => null,
});

export const usePresence = () => useContext(PresenceContext);
