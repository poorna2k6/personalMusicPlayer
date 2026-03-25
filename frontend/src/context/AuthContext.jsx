import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// authState values:
//   'loading'        — checking localStorage on startup
//   'unauthenticated' — no session, show login screen
//   'authenticated'  — signed in with Google
//   'skipped'        — user chose guest mode

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [authState, setAuthState] = useState('loading');

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    const skipped = localStorage.getItem('auth_skipped');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setAuthState('authenticated');
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setAuthState('unauthenticated');
      }
    } else if (skipped === 'true') {
      setAuthState('skipped');
    } else {
      setAuthState('unauthenticated');
    }
  }, []);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    setAuthState('authenticated');
    localStorage.setItem('auth_token', authToken);
    localStorage.setItem('auth_user', JSON.stringify(userData));
    localStorage.removeItem('auth_skipped');
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setAuthState('unauthenticated');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_skipped');
  };

  const skip = () => {
    setAuthState('skipped');
    localStorage.setItem('auth_skipped', 'true');
  };

  return (
    <AuthContext.Provider value={{ user, token, authState, login, logout, skip }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
