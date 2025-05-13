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
} from 'react-native';
import { BleManager, State } from 'react-native-ble-plx';
import { decode as atob } from 'base-64';
import { WebView } from 'react-native-webview';
import { getDatabase, ref, set } from '@react-native-firebase/database';
import { getApp } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import { useAuth } from '../contexts/AuthContext';

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
  const managerRef = useRef(new BleManager());

  const uploadToFirebase = async (lat, lon, deviceId, bootTimeMs) => {
    const now = new Date().toISOString();
    const uid = auth().currentUser?.uid;

    const data = {
      lat,
      lon,
      appTimestamp: now,
      bootTimeMs,
      deviceId,
      uid,
    };

    const db = getDatabase(getApp());
    const safeDeviceId = (deviceId || "unknown").replace(/[:.#$\[\]]/g, '_');

    await set(ref(db, `/emergencies/${safeDeviceId}`), data)
      .then(() => console.log("📡 Sent EMERGENCY GPS to Firebase:", data))
      .catch(err => console.error("❌ Firebase upload failed:", err));
  };

  useEffect(() => {
    let stateSub = null;
    let bleManager = managerRef.current;

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

      bleManager.startDeviceScan(null, null, (error, device) => {
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
                          const parts = raw.split(",");
                          console.log("📦 Parsed parts:", parts);

                          if (parts.length === 1 && raw === parts[0]) {
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
