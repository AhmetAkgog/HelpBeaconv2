// Full working version with BLE emergency ping, default GPS, and scoped deviceId fix
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
// const MOCK_DEVICES = [
//   { id: 'MOCK-DEVICE-001', name: 'GPS Tracker A' },
//   { id: 'MOCK-DEVICE-002', name: 'HelpBeacon Collar B' },
// ];
const app = getApp();
const manager = new BleManager();
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';

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
  const uploadToFirebase = async (lat, lon, deviceId, bootTimeMs) => {
    const now = new Date().toISOString();
    const uid = auth().currentUser?.uid;

    const data = {
      lat,
      lon,
      appTimestamp: now,
      bootTimeMs,
      deviceId,
      uid, // ✅ include the uid only once
    };

    const db = getDatabase(getApp());
    const safeDeviceId = (deviceId || "unknown").replace(/[:.#$\[\]]/g, '_');

    await set(ref(db, `/emergencies/${safeDeviceId}`), data)
      .then(() => console.log("📡 Sent EMERGENCY GPS to Firebase:", data))
      .catch(err => console.error("❌ Firebase upload failed:", err));

    // 🔁 Optional: REMOVE these if no longer needed
    /*
    if (uid) {
      const gpsString = `${lat},${lon}`;
      await set(ref(db, `users/${uid}/emergency`), true);
      await set(ref(db, `users/${uid}/gps`), gpsString);
      console.log("✅ Synced emergency location to /users/" + uid);
    } else {
      console.warn("⚠️ No user logged in – cannot sync to /users/{uid}");
    }
    */
  };

  useEffect(() => {
    let stateSub = null;

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
      const denied = Object.entries(results).filter(
        ([, result]) => result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      );

      if (denied.length > 0) {
        Alert.alert('Permission Required', 'Some permissions were permanently denied. Please enable them in app settings.', [
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return false;
      }

      return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
    };

    const startScan = async () => {
      const granted = await requestPermissions();
      if (!granted) return;

      manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          return;
        }

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

      stateSub = manager.onStateChange((state) => {
        if (state === State.PoweredOn) startScan();
      }, true);
    };

    monitorBluetooth();

    return () => {
      manager.destroy();
      if (stateSub) stateSub.remove();
    };
  }, []);

  const connectToDevice = async (device) => {
    manager.stopDeviceScan();
    try {
      await manager.cancelDeviceConnection(device.id);
    } catch {}

    try {
      const connected = await manager.connectToDevice(device.id);
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

                    // Restart message if a new one begins
                    if (fragment.includes("EMERGENCY:") || fragment.includes("LOCAL:")) {
                      bleBufferRef.current = fragment;
                    }

                    const commaCount = (bleBufferRef.current.match(/,/g) || []).length;
                    if (commaCount >= 2) {
                      const fullMsg = bleBufferRef.current.trim();
                      bleBufferRef.current = "";

                      console.log("📩 Full message:", fullMsg);
                      setGpsData(fullMsg);

                      const deviceId = deviceIdRef.current;

                      (async () => {
                        if (fullMsg.startsWith("EMERGENCY:")) {
                          const raw = fullMsg.replace("EMERGENCY:", "");
                          const deviceId = deviceIdRef.current;

                          const parts = raw.split(",");
                          console.log("📦 Parsed parts:", parts);

                          if (parts.length === 1 && raw === parts[0]) {
                            // SEARCHING case — only timestamp, no lat/lon yet
                            if (!hasSentSearching.current) {
                              await uploadToFirebase(0, 0, deviceId, Date.now());
                              hasSentSearching.current = true;
                              console.log("⚠️ Sent SEARCHING ping with lat/lon 0");
                            }
                          }

                          if (parts.length === 3) {
                            const [timestamp, latStr, lonStr] = parts;
                            const lat = parseFloat(latStr);
                            const lon = parseFloat(lonStr);
                            console.log("📍 Got GPS fix → lat:", lat, "lon:", lon);

                            if (!isNaN(lat) && !isNaN(lon)) {
                              const now = Date.now();
                              if (now - lastUploadTimeRef.current > 15000) {
                                await uploadToFirebase(lat, lon, deviceId, Number(timestamp));
                                lastUploadTimeRef.current = now;
                                console.log("✅ Sent real GPS location to Firebase");
                              }
                              webViewRef.current?.injectJavaScript(`updateMap(${lat}, ${lon}); true;`);
                            }
                          }
                        } else if (fullMsg.startsWith("LOCAL:")) {
                          const parts = fullMsg.replace("LOCAL:", "").split(",");
                          const [, latStr, lonStr] = parts;
                          const lat = parseFloat(latStr);
                          const lon = parseFloat(lonStr);
                          if (!isNaN(lat) && !isNaN(lon)) {
                            webViewRef.current?.injectJavaScript(`updateMap(${lat}, ${lon}); true;`);
                          }
                        }
                      })();
                    }
                  }
                }
              );
            }, 1000);
          }
        }
      }

      updated.onDisconnected(() => {
        setConnectedDevice(null);
        setGpsData('');
        setGpsLog([]);
        setTimeout(() => {
          manager.startDeviceScan(null, null, (error, device) => {
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
        <ScrollView>
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
              <Text style={styles.subTitle}>Nearby Mock Devices</Text>
            }
          />
        )}
        </ScrollView>

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
  // deviceItem: { padding: 15, borderBottomWidth: 1, borderColor: '#ccc' },
  // deviceId: { fontSize: 12, color: '#888' },
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
    marginBottom: 115,
  },
  map: { flex: 1 },
    datacard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 19,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'column',
    marginTop: 20,
  },
});
