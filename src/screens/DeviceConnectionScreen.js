import React, { useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Alert,
  Linking,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { BleManager, State } from 'react-native-ble-plx';
import { decode as atob } from 'base-64';
import { WebView } from 'react-native-webview';
import { getDatabase, ref, set } from '@react-native-firebase/database';
import { getApp } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import Geolocation from '@react-native-community/geolocation';

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';

// Helper function to calculate distance between coordinates
function distanceBetween(pos1, pos2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = pos1.lat * Math.PI/180;
  const φ2 = pos2.lat * Math.PI/180;
  const Δφ = (pos2.lat-pos1.lat) * Math.PI/180;
  const Δλ = (pos2.lon-pos1.lon) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

const DeviceConnectionScreen = () => {
  const { user, authInitialized } = useAuth();
  const [devices, setDevices] = useState([]);
  const deviceMap = useRef(new Map());
  const [connectedDevice, setConnectedDevice] = useState(null);
  const deviceIdRef = useRef("unknown");
  const [gpsData, setGpsData] = useState('');
  const [gpsLog, setGpsLog] = useState([]);
  const webViewRef = useRef(null);
  const hasSentSearching = useRef(false);
  const lastUploadTimeRef = useRef(0);
  const bleBufferRef = useRef("");
  const managerRef = useRef(new BleManager());
  const [usePhoneGps, setUsePhoneGps] = useState(false);
  const phoneGpsWatchIdRef = useRef(null);

  // Anti-spam tracking refs
  const lastEmergencyNotificationRef = useRef(null);
  const lastPhoneGpsLocationRef = useRef(null);
  const lastLocalNotificationRef = useRef(null);

  const uploadToFirebase = async (lat, lon, deviceId, bootTimeMs, source = 'BLE', isInitial = false) => {
    const now = new Date().toISOString();
    const uid = auth().currentUser?.uid;

    // Only send notification for initial emergency or significant location change
    const shouldNotify = isInitial ||
                       (source === 'PHONE' &&
                        (!lastPhoneGpsLocationRef.current ||
                         distanceBetween(lastPhoneGpsLocationRef.current, {lat, lon}) > 50));

    if (!shouldNotify && source === 'PHONE') {
      console.log("📍 Phone GPS Update (throttled)");
      return;
    }

    const data = {
      lat,
      lon,
      appTimestamp: now,
      bootTimeMs,
      deviceId,
      uid,
      source,
      isInitialNotification: isInitial
    };

    const db = getDatabase(getApp());
    const safeDeviceId = (deviceId || "unknown").replace(/[:.#$\[\]]/g, '_');

    await set(ref(db, `/emergencies/${safeDeviceId}`), data)
      .then(() => {
        console.log("📡 Sent GPS to Firebase:", {source, isInitial});
        if (source === 'PHONE') {
          lastPhoneGpsLocationRef.current = {lat, lon};
        }
      })
      .catch(err => console.error("❌ Firebase upload failed:", err));
  };


  // Add cleanup effect
  useEffect(() => {
    return () => {
      if (phoneGpsWatchIdRef.current !== null) {
        Geolocation.clearWatch(phoneGpsWatchIdRef.current);
        console.log('🛑 Cleaned up phone GPS on component unmount');
      }
    };
  }, []);

  useEffect(() => {
    let stateSub = null;
    let bleManager = managerRef.current;

    const openLocationPermissionSettings = () => {
      Linking.openSettings();
    };

    const requestPermissions = async () => {
      const isAndroid12OrAbove = Platform.OS === 'android' && Platform.Version >= 31;
      const permissions = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

      if (isAndroid12OrAbove) {
        permissions.push(
          'android.permission.BLUETOOTH_CONNECT',
          'android.permission.BLUETOOTH_SCAN'
        );
      }

      const results = await PermissionsAndroid.requestMultiple(permissions);
      const allGranted = Object.values(results).every(
        r => r === PermissionsAndroid.RESULTS.GRANTED
      );

      if (Platform.OS === 'android' && Platform.Version >= 29) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
        );
      }

      return allGranted;
    };

    const startScan = async () => {
      const granted = await requestPermissions();
      if (!granted) return;

      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) return;
        if (!device || !device.name || deviceMap.current.has(device.id)) return;
        if (device.name.includes('GPS')) {
          deviceMap.current.set(device.id, device);
          setDevices(Array.from(deviceMap.current.values()));
        }
      });
    };

    const monitorBluetooth = async () => {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      stateSub = bleManager.onStateChange((state) => {
        if (state === State.PoweredOn) startScan();
      }, true);
    };

    monitorBluetooth();

    return () => {
      bleManager.destroy();
      managerRef.current = new BleManager();
      if (stateSub) stateSub.remove();
    };
  }, []);

  const reconnectBLE = () => {
    managerRef.current.destroy();
    managerRef.current = new BleManager();
  };

    const connectToDevice = async (device) => {
      reconnectBLE();
      const bleManager = managerRef.current;
      bleManager.stopDeviceScan();

      try {
        await bleManager.cancelDeviceConnection(device.id);
      } catch {}

      try {
        const connected = await bleManager.connectToDevice(device.id);
        setConnectedDevice(connected);
        deviceIdRef.current = device.id;
        const updated = await connected.discoverAllServicesAndCharacteristics();

        const services = await updated.services();

        for (const service of services) {
          if (service.uuid.toLowerCase() !== SERVICE_UUID.toLowerCase()) continue;

          const characteristics = await service.characteristics();

          for (const char of characteristics) {
            if (char.isNotifiable) {
              setTimeout(() => {
                connected.monitorCharacteristicForService(
                  service.uuid,
                  char.uuid,
                  (error, characteristic) => {
                    if (error) {
                      console.error('Monitor error:', error);
                      return;
                    }

                    if (characteristic?.value) {
                      const fragment = atob(characteristic.value).trim();
                      bleBufferRef.current += fragment;

                      console.log("🧩 BLE Fragment:", fragment);

                      if (fragment.includes("EMERGENCY:") || fragment.includes("LOCAL:")) {
                        bleBufferRef.current = fragment;
                      }

                      const fullMsg = bleBufferRef.current.trim();
                      const isEmergency = fullMsg.startsWith("EMERGENCY:");
                      const commaCount = (fullMsg.match(/,/g) || []).length;

                      // 💡 Handle EMERGENCY with NO GPS yet
                      if (isEmergency && commaCount === 0 && !hasSentSearching.current) {
                        const now = Date.now();

                        // Only send initial emergency if we haven't sent one recently
                        if (!lastEmergencyNotificationRef.current ||
                            now - lastEmergencyNotificationRef.current > 30000) {
                          console.log("⚠️ Emergency mode - starting phone GPS fallback");
                          uploadToFirebase(0, 0, deviceIdRef.current, now, 'BLE', true);
                          lastEmergencyNotificationRef.current = now;
                        }

                        hasSentSearching.current = true;
                        bleBufferRef.current = "";

                        if (phoneGpsWatchIdRef.current === null) {
                          setUsePhoneGps(true);
                          phoneGpsWatchIdRef.current = Geolocation.watchPosition(
                            (pos) => {
                              const { latitude, longitude } = pos.coords;
                              uploadToFirebase(latitude, longitude, deviceIdRef.current, Date.now(), 'PHONE');
                              webViewRef.current?.injectJavaScript(`updateMap(${latitude}, ${longitude}); true;`);
                            },
                            (err) => console.error("📵 Phone GPS Error:", err),
                            {
                              enableHighAccuracy: true,
                              distanceFilter: 50, // Only update when moved 50+ meters
                              interval: 10000,
                              fastestInterval: 5000,
                              timeout: 10000,
                              maximumAge: 0
                            }
                          );
                        }
                        return;
                      }

                      // ✅ Handle EMERGENCY with GPS
                      if (isEmergency && commaCount >= 2) {
                        const raw = fullMsg.replace("EMERGENCY:", "");
                        const parts = raw.split(",");

                        if (parts.length === 3) {
                          const [timestamp, latStr, lonStr] = parts;
                          const lat = parseFloat(latStr);
                          const lon = parseFloat(lonStr);

                          // Stop phone GPS if BLE GPS is back
                          if (phoneGpsWatchIdRef.current !== null) {
                            Geolocation.clearWatch(phoneGpsWatchIdRef.current);
                            phoneGpsWatchIdRef.current = null;
                            setUsePhoneGps(false);
                            console.log("🛑 Stopped phone GPS - BLE GPS restored");
                          }

                          if (!isNaN(lat) && !isNaN(lon)) {
                            uploadToFirebase(lat, lon, deviceIdRef.current, Number(timestamp), 'BLE');
                            webViewRef.current?.injectJavaScript(`updateMap(${lat}, ${lon}); true;`);
                          }
                        }
                      }

                      // 🔄 Handle LOCAL mode
                      if (fullMsg.startsWith("LOCAL:")) {
                        const now = Date.now();

                        // Only process LOCAL mode if we haven't done so recently
                        if (!lastLocalNotificationRef.current || now - lastLocalNotificationRef.current > 10000) {
                          console.log("🔄 Switching to LOCAL mode");
                          lastLocalNotificationRef.current = now;

                          if (phoneGpsWatchIdRef.current !== null) {
                            Geolocation.clearWatch(phoneGpsWatchIdRef.current);
                            phoneGpsWatchIdRef.current = null;
                            setUsePhoneGps(false);
                            console.log("🛑 Stopped phone GPS - LOCAL mode activated");
                          }

                          hasSentSearching.current = false;

                          const parts = fullMsg.replace("LOCAL:", "").split(",");
                          if (parts.length >= 3) {
                            const lat = parseFloat(parts[1]);
                            const lon = parseFloat(parts[2]);
                            if (!isNaN(lat) && !isNaN(lon)) {
                              webViewRef.current?.injectJavaScript(`updateMap(${lat}, ${lon}); true;`);
                            }
                          }
                        }
                        return;
                      }
                    }
                  }
                );
              }, 1000);
            }
          }
        }

        updated.onDisconnected(() => {
          console.log("🔌 BLE Disconnected");

          // Stop phone GPS fallback on disconnection
          if (phoneGpsWatchIdRef.current !== null) {
            Geolocation.clearWatch(phoneGpsWatchIdRef.current);
            phoneGpsWatchIdRef.current = null;
            setUsePhoneGps(false);
            console.log("🛑 Stopped phone GPS - BLE disconnected");
          }

          setConnectedDevice(null);
          setGpsData('');
          setGpsLog([]);
          hasSentSearching.current = false;

          setTimeout(() => {
            reconnectBLE();
            managerRef.current.startDeviceScan(null, null, (error, device) => {
              if (error) return;
              if (!device || !device.name || deviceMap.current.has(device.id)) return;
              if (device.name.includes("GPS")) {
                deviceMap.current.set(device.id, device);
                setDevices(Array.from(deviceMap.current.values()));
              }
            });
          }, 3000);
        });
      } catch (e) {
        console.error('Connection error:', e);
        Alert.alert('Failed to connect');
      }
    };


  const renderLog = () => (
    <ScrollView style={{ maxHeight: 200, marginTop: 10 }}>
      {gpsLog.map((entry, index) => (
        <Text key={index} style={{ fontSize: 14, color: '#555' }}>• {entry}</Text>
      ))}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {connectedDevice ? (
          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 18, marginBottom: 10 }}>
              Connected to: {connectedDevice.name}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: 'bold' }}>GPS Output</Text>
            {gpsData ? (
              <ScrollView style={{ maxHeight: 80 }}>
                <Text style={{ fontSize: 16 }} numberOfLines={3} adjustsFontSizeToFit>
                  {gpsData}
                </Text>
              </ScrollView>
            ) : (
              <Text style={{ fontSize: 16, color: '#999' }}>Waiting for GPS data...</Text>
            )}
            {renderLog()}
          </View>
        ) : (
          <FlatList
            contentContainerStyle={{ paddingTop: 50 }}
            data={devices}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ padding: 15, borderBottomWidth: 1, borderColor: '#ccc' }}
                onPress={() => connectToDevice(item)}
              >
                <Text>{item.name}</Text>
                <Text style={{ fontSize: 12, color: '#888' }}>{item.id}</Text>
              </TouchableOpacity>
            )}
            ListHeaderComponent={
              <Text style={{ fontSize: 18, textAlign: 'center', marginBottom: 10 }}>
                Nearby GPS Devices
              </Text>
            }
          />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <WebView
          ref={webViewRef}
          source={{ uri: 'file:///android_asset/map_sender.html' }}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          style={{ flex: 1, backgroundColor: 'white' }}
          onLoadEnd={() => {
            console.log("✅ WebView loaded – injecting default coords");
            setTimeout(() => {
              webViewRef.current?.injectJavaScript(`
                updateMap(48.1351, 11.5820);
                true;
              `);
            }, 500);
          }}
          onError={(e) => console.log("❌ WebView error:", e.nativeEvent)}
        />
      </View>
    </View>
  );
};

export default DeviceConnectionScreen;
