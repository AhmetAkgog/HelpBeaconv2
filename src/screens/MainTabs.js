import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './HomeScreen';
import DeviceConnectionScreen from './DeviceConnectionScreen';
import FriendsScreen from './FriendsScreen';
import SettingsScreen from './SettingsScreen';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { View, Image, StyleSheet } from 'react-native';


const EmptyComponent = () => <></>;

const Tab = createBottomTabNavigator();

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color }) => {
          if (route.name === 'FooterLogo') {
            return (
              <View style={styles.emergencyButton}>
                <Image
                  source={require('../assets/footer.png')}
                  style={styles.emergencyIcon}
                  resizeMode="contain"
                />
              </View>
            );
          }

          let iconName;
          if (route.name === 'Home') iconName = 'home-outline';
          else if (route.name === 'Device') iconName = 'bluetooth-outline';
          else if (route.name === 'Friends') iconName = 'people-outline';
          else if (route.name === 'Settings') iconName = 'settings-outline';

          return (
            <View style={styles.tabIcon}>
              <Ionicons style = {styles.iconplacement} name={iconName} size={25} color={color} />
            </View>
          );
        },
        tabBarActiveTintColor: '#FF1010',
        tabBarInactiveTintColor: '#383838',
        tabBarStyle: styles.tabBar,
        headerShown: false,
        tabBarLabel: route.name === 'FooterLogo' ? () => null : undefined,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Device" component={DeviceConnectionScreen} />
      <Tab.Screen
        name="FooterLogo"
        component={EmptyComponent}
        options={{
          tabBarButton: () => (
            <View style={styles.floatingButtonWrapper}>
              <View style={styles.emergencyButton}>
                <Image
                  source={require('../assets/footer.png')}
                  style={styles.emergencyIcon}
                  resizeMode="contain"
                />
              </View>
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tab.Screen name="Friends" component={FriendsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export default MainTabs;

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    height: 68,
    position: 'absolute',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 8,
    paddingBottom: 10,
  },
  emergencyButton: {
    backgroundColor: '#f72513',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  emergencyIcon: {
    width: 45,
    height: 45,
  },
  iconplacement: {
    marginBottom: -6
  },
  floatingButtonWrapper: {
    position: 'absolute',
    bottom: -7,
    left: '50%',
    transform: [{ translateX: -40 }],
    zIndex: 10,
  },
});
