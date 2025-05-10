import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import LoginSignupScreen from './LoginSignupScreen';
import MainTabs from './MainTabs';
import { useAuth } from '../contexts/AuthContext';
import { NavigationContainer } from '@react-navigation/native';

const Stack = createStackNavigator();

const AuthWrapper = () => {
  const { user, authInitialized } = useAuth();
// force touch
  if (!authInitialized) {
    console.log("⏳ Waiting for auth...");
    return null;
  }

  console.log("✅ authInitialized:", authInitialized);
  console.log("👤 user:", user);

  return (
    <NavigationContainer independent={true}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="MainTabs" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginSignupScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AuthWrapper;
