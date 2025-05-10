import 'react-native-gesture-handler';
import messaging from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// ✅ This enables handling notifications when the app is in background or terminated
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('📦 Background message received:', remoteMessage);
  // You can add logic here if needed
});

AppRegistry.registerComponent(appName, () => App);// force touc
