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
  StyleSheet,
  ImageBackground
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
                        console.log("🧩 BLE Fragment:", fragment);

                        // Always accumulate unless it's a complete SEARCHING message
                        if (fragment === "EMERGENCY:SEARCHING" || fragment.startsWith("LOCAL:")) {
                            bleBufferRef.current = fragment;
                        } else {
                            // Handle case where a new message starts before previous was complete
                            if (fragment.startsWith("EMERGENCY:")) {
                                bleBufferRef.current = fragment;
                            } else {
                                bleBufferRef.current += fragment;
                            }
                        }

                        const fullMsg = bleBufferRef.current.trim();
                        console.log("🧵 Buffer:", fullMsg);

                        const isEmergency = fullMsg.startsWith("EMERGENCY:");
                        const isLocal = fullMsg.startsWith("LOCAL:");
                        const isSearching = fullMsg === "EMERGENCY:SEARCHING";
                        const commaCount = (fullMsg.match(/,/g) || []).length;

                        // 🚨 Handle SEARCHING message
                        if (isSearching && !hasSentSearching.current) {
                            const now = Date.now();
                            console.log("⚠️ Emergency SEARCHING — starting phone GPS fallback");

                            if (!lastEmergencyNotificationRef.current || now - lastEmergencyNotificationRef.current > 30000) {
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
                                        console.log("📍 Phone GPS:", latitude, longitude);
                                        uploadToFirebase(latitude, longitude, deviceIdRef.current, Date.now(), 'PHONE');
                                        webViewRef.current?.injectJavaScript(`updateMap(${latitude}, ${longitude}); true;`);
                                    },
                                    (err) => console.error("📵 Phone GPS Error:", err),
                                    {
                                        enableHighAccuracy: true,
                                        distanceFilter: 50,
                                        interval: 10000,
                                        fastestInterval: 5000,
                                        timeout: 10000,
                                        maximumAge: 0,
                                    }
                                );
                            }
                            return;
                        }

                        // Handle GPS coordinates (now more tolerant of partial messages)
                        if (isEmergency && commaCount >= 1 && !fullMsg.includes("SEARCHING")) {
                            // Only process if we have at least timestamp and partial coords
                            const raw = fullMsg.replace("EMERGENCY:", "");
                            const parts = raw.split(",");

                            // If we have complete coordinates (timestamp, lat, lon)
                            if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
                                const [timestamp, latStr, lonStr] = parts;
                                const lat = parseFloat(latStr);
                                const lon = parseFloat(lonStr);

                                if (!isNaN(lat) && !isNaN(lon)) {
                                    console.log("📡 Valid BLE GPS:", lat, lon);
                                    hasSentSearching.current = false;

                                    if (phoneGpsWatchIdRef.current !== null) {
                                        Geolocation.clearWatch(phoneGpsWatchIdRef.current);
                                        phoneGpsWatchIdRef.current = null;
                                        setUsePhoneGps(false);
                                        console.log("🛑 Stopped phone GPS - BLE GPS restored");
                                    }

                                    uploadToFirebase(lat, lon, deviceIdRef.current, Number(timestamp), 'BLE');
                                    webViewRef.current?.injectJavaScript(`updateMap(${lat}, ${lon}); true;`);
                                    bleBufferRef.current = "";
                                } else {
                                    console.warn("⚠️ Invalid GPS data parsed from BLE message", { latStr, lonStr });
                                }
                            } else {
                                console.log("🔍 Partial BLE GPS data received, waiting for more...", parts);
                            }
                            return;
                        }

                        // 🔄 LOCAL mode (unchanged)
                        if (isLocal && commaCount >= 2) {
                            const parts = fullMsg.replace("LOCAL:", "").split(",");
                            const lat = parseFloat(parts[1]);
                            const lon = parseFloat(parts[2]);

                            if (!isNaN(lat) && !isNaN(lon)) {
                                console.log("📍 LOCAL GPS:", lat, lon);
                                hasSentSearching.current = false;

                                if (phoneGpsWatchIdRef.current !== null) {
                                    Geolocation.clearWatch(phoneGpsWatchIdRef.current);
                                    phoneGpsWatchIdRef.current = null;
                                    setUsePhoneGps(false);
                                    console.log("🛑 Stopped phone GPS - LOCAL mode activated");
                                }

                                webViewRef.current?.injectJavaScript(`updateMap(${lat}, ${lon}); true;`);
                                bleBufferRef.current = "";
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

            // Reset searching flag on disconnection
            hasSentSearching.current = false;  // <-- Add this line

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
      <ImageBackground source={require('../assets/Background.jpeg')} style={styles.background}>
        <View style={styles.overlay} />

        <View style={styles.container}>
          <Text style={styles.title}>🔗 Device Connection</Text>

          {connectedDevice ? (
            <View style={styles.card}>
              <Text style={styles.label}>
                Connected to : <Text style={styles.value}>{connectedDevice.name}</Text>
              </Text>
              <Text style={[styles.label, { marginTop: 12 }]}>
                GPS Output : <Text style={styles.value}>{gpsData}</Text>
              </Text>

            </View>
          ) : (
            <FlatList
              contentContainerStyle={{ paddingVertical: 10 }}
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.deviceItem} onPress={() => connectToDevice(item)}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.deviceId}>{item.id}</Text>
                </TouchableOpacity>
              )}
              ListHeaderComponent={
                <Text style={styles.subTitle}>Nearby GPS Devices</Text>
              }
            />
          )}


          <View style={styles.mapContainer}>
            <WebView
              ref={webViewRef}
              source={{ uri: 'file:///android_asset/map_sender.html' }}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              style={styles.map}
              onLoadEnd={() => {
                setTimeout(() => {
                  webViewRef.current?.injectJavaScript(`updateMap(48.1351, 11.5820); true;`);
                }, 500);
              }}
            />
          </View>
        </View>
      </ImageBackground>
    );
  };

  export default DeviceConnectionScreen;
  const styles = StyleSheet.create({
    background: { flex: 1 },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    container: { flex: 1, padding: 16 },
    title: {
      fontSize: 30,
      fontWeight: 'bold',
      color: '#fff',
      textAlign: 'center',
      marginVertical: 24,
      textShadowColor: '#000',
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 4,
    },
    subTitle: {
      fontSize: 20,
      color: '#fff',
      textAlign: 'center',
      marginBottom: 10,
    },
    card: {
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderRadius: 16,
      padding: 16,
      marginBottom: 35,
    },
    label: {
      fontSize: 20,
      fontWeight: '600',
      color: '#333',
    },
    value: {
      fontSize: 18,
      color: '#444',
      marginTop: 4,
    },
    deviceItem: {
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 2,
    },
    deviceName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
    deviceId: { fontSize: 12, color: '#555' },
    mapContainer: {
      height:440,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: '#fff',
      marginBottom: 100,
    },
    map: { flex: 1 },
  });
