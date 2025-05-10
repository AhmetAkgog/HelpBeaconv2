import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AuthWrapper from './src/screens/AuthWrapper';

import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database'; // ✅ Native version

import { AuthProvider } from './src/contexts/AuthContext';

const registerFcmToken = async (user) => {
  try {
    const permission = await messaging().requestPermission();
    const enabled =
      permission === messaging.AuthorizationStatus.AUTHORIZED ||
      permission === messaging.AuthorizationStatus.PROVISIONAL;
// force touch
    if (!enabled) {
      console.log("🚫 Notification permission not granted");
      return;
    }

    const token = await messaging().getToken();
    console.log("📲 FCM Token:", token);

    await database().ref(`tokens/${user.uid}`).set(token);
  } catch (err) {
    console.error("❌ Failed to register FCM token:", err);
  }
};

const App = () => {
  useEffect(() => {
    const unsubscribeAuth = auth().onAuthStateChanged((user) => {
      if (user) {
        registerFcmToken(user);
      }
    });

    const unsubscribeRefresh = messaging().onTokenRefresh(async (newToken) => {
      const user = auth().currentUser;
      if (user) {
        await database().ref(`tokens/${user.uid}`).set(newToken);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeRefresh();
    };
  }, []);

  return (
    <AuthProvider>

        <AuthWrapper />

    </AuthProvider>
  );
};

export default App;