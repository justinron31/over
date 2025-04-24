// Re-export AuthContext
export * from "./AuthContext";

// Re-export PresenceContext
export { PresenceProvider } from "./PresenceContext";
export {
  usePresence,
  type PresenceContextType,
  type PresenceState,
  type LastSeenState,
} from "./presenceContextHelpers";
