import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';
import { WebView } from 'react-native-webview';

const HomeScreen = () => {
  const currentUID = auth().currentUser?.uid;
  const [loading, setLoading] = useState(true);
  const [emergencyFriends, setEmergencyFriends] = useState([]);
  const webViewRef = useRef(null);

  useEffect(() => {
    if (!currentUID) return;

    const loadEmergencyFriends = async () => {
      try {
        const friendListRef = database().ref(`friendships/${currentUID}/friendList`);
        const friendSnap = await friendListRef.once("value");
        const friendMap = friendSnap.exists() ? friendSnap.val() : {};
        const friendUIDs = Object.keys(friendMap);

        const emergenciesRef = database().ref("emergencies");
        emergenciesRef.on("value", async (snapshot) => {
          const allEmergencies = snapshot.val() || {};
          const activeFriends = [];

          for (const [deviceId, emergencyData] of Object.entries(allEmergencies)) {
            const uid = emergencyData.uid;
            if (friendUIDs.includes(uid)) {
              const profileSnap = await database().ref(`users/${uid}/publicProfile`).once("value");
              const profile = profileSnap.val();

              const name =
                profile?.displayName ||
                `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() ||
                uid;

              const gpsString =
                emergencyData.lat && emergencyData.lon
                  ? `${emergencyData.lat},${emergencyData.lon}`
                  : null;

              const friend = {
                uid,
                name,
                gps: gpsString,
              };

              activeFriends.push(friend);

              if (gpsString) {
                const [lat, lon] = gpsString.split(',').map(parseFloat);
                if (!isNaN(lat) && !isNaN(lon)) {
                  webViewRef.current?.injectJavaScript(`
                    updateMap('${uid}', ${lat}, ${lon}, '${name}');
                    true;
                  `);
                }
              }
            }
          }

          setEmergencyFriends(activeFriends);
        });

        setLoading(false);
      } catch (error) {
        console.error("Error loading emergency friends:", error);
        setLoading(false);
      }
    };

    loadEmergencyFriends();
  }, [currentUID]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚨 Emergency Friends</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#1e90ff" />
      ) : (
        <ScrollView style={styles.list}>
          {emergencyFriends.length === 0 ? (
            <Text style={styles.empty}>None of your friends are in emergency.</Text>
          ) : (
            emergencyFriends.map((friend) => (
              <View key={friend.uid} style={styles.friendItem}>
                <Text style={styles.friendText}>{friend.name}</Text>
                <Text style={styles.gpsText}>
                  {friend.gps ? `📍 ${friend.gps}` : '⏳ Waiting for GPS fix...'}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: 'file:///android_asset/map_tracker.html' }}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        style={styles.map}
        onLoadEnd={() => {
          console.log("✅ Tracker Map loaded");
        }}
        onError={(e) => console.log("❌ WebView error:", e.nativeEvent)}
      />
    </View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 10, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  list: { maxHeight: 200, marginBottom: 10 },
  friendItem: {
    borderBottomWidth: 1,
    borderColor: '#eee',
    paddingVertical: 8,
  },
  friendText: { fontSize: 16, fontWeight: '500' },
  gpsText: { fontSize: 14, color: '#666' },
  empty: { textAlign: 'center', color: '#999', marginTop: 20 },
  map: { flex: 1, borderWidth: 1, borderColor: '#ccc' },
});
