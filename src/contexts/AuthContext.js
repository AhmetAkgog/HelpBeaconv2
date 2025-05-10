// src/contexts/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import auth from '@react-native-firebase/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(userAuth => {
      console.log('✅ Firebase auth state changed');
      console.log('👤 User:', userAuth);
      setUser(userAuth);
      setAuthInitialized(true);
    });
    return unsubscribe;
  }, []);
// force touch
  return (
    <AuthContext.Provider value={{ user, authInitialized }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
