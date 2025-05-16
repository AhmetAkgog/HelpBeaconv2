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
    const loadEverything = async () => {
      if (!currentUID) return;

      const friendListRef = database().ref(`friendships/${currentUID}/friendList`);
      const friendSnap = await friendListRef.once("value");
      const friendMap = friendSnap.exists() ? friendSnap.val() : {};

      const activeFriends = [];

      for (const friendId in friendMap) {
        if (friendId === currentUID) continue;
        console.log("👀 Checking friend:", friendId);

        try {
          const profilePath = `users/${friendId}/publicProfile`;
          const profileSnap = await database().ref(profilePath).once("value");

          if (!profileSnap.exists()) {
            console.warn(`⚠️ publicProfile missing for ${friendId}`);
            continue;
          }

          const profile = profileSnap.val();
          console.log(`✅ Accessed ${profilePath}`, profile);

          const name = profile?.displayName?.trim() ||
                       `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() ||
                       friendId;

          let snapshot = null;
          try {
            const emergenciesRef = database().ref("emergencies");
            snapshot = await emergenciesRef
              .orderByChild("uid")
              .equalTo(friendId)
              .limitToLast(1)
              .once("value");

            console.log(`✅ Fetched emergency for ${friendId}:`, snapshot.val());
          } catch (err) {
            console.error(`❌ Failed to access emergencies for ${friendId}:`, err);
            continue;
          }

          if (!snapshot) continue;

          snapshot.forEach(child => {
            const val = child.val();
            if (val.lat && val.lon) {
              activeFriends.push({
                uid: friendId,
                name,
                gps: `${val.lat},${val.lon}`,
                source: 'emergency'
              });

              webViewRef.current?.injectJavaScript(`
                updateMap('${friendId}', ${val.lat}, ${val.lon}, '${name}');
                true;
              `);
            }
          });
        } catch (error) {
          console.error(`Error processing friend ${friendId}:`, error);
        }
      }

      setEmergencyFriends(activeFriends);
      setLoading(false);
    };

    loadEverything();

    return () => {
      database().ref("emergencies").off();
      database().ref("friendships").off();
    };
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
              <View key={`${friend.uid}_${friend.source}`} style={styles.friendItem}>
                <Text style={styles.friendText}>{friend.name}</Text>
                <Text style={styles.gpsText}>
                  {friend.gps ? `📍 ${friend.gps}` : '⏳ Waiting for GPS...'}
                </Text>
                <Text style={styles.sourceText}>{friend.source.toUpperCase()}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: 'file:///android_asset/map_tracker.html' }}
        style={styles.map}
        onLoadEnd={() => {
          console.log("Map loaded");
        }}
      />
    </View>
  );
};

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
  sourceText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#999', marginTop: 20 },
  map: { flex: 1, borderWidth: 1, borderColor: '#ccc' },
});

export default HomeScreen;
