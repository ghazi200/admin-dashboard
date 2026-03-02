import { useAuth } from "../auth/AuthContext";
import { useSessionTimeout } from "../hooks/useSessionTimeout";

/**
 * Renders nothing. When the user is logged in, runs session timeout:
 * after 15–60 min (default 30) of no activity, clears session and redirects to /login.
 * Set REACT_APP_SESSION_TIMEOUT_MINUTES in .env (15–60).
 */
export default function SessionTimeout() {
  const { isAuthed } = useAuth();
  useSessionTimeout({ enabled: !!isAuthed });
  return null;
}
