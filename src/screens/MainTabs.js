import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './HomeScreen';
import DeviceConnectionScreen from './DeviceConnectionScreen';
import FriendsScreen from './FriendsScreen';
import SettingsScreen from './SettingsScreen';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { View, ActivityIndicator } from 'react-native';

const Tab = createBottomTabNavigator();

const MainTabs = () => {
  const { user, authInitialized } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    if (authInitialized && !user) {
      navigation.navigate('Login');
    }// force touch
  }, [authInitialized, user]);

  if (!authInitialized || !user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Device Connection" component={DeviceConnectionScreen} />
      <Tab.Screen name="Friends" component={FriendsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export default MainTabs;
