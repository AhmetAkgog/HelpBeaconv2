import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ImageBackground,
} from 'react-native';
import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';
import { WebView } from 'react-native-webview';

const HomeScreen = () => {
  const currentUID = auth().currentUser?.uid;
  const [emergencyFriends, setEmergencyFriends] = useState([]);
  const webViewRef = useRef(null);

    // useEffect(() => {
    //   // TESTING OTHER STATEMENTS
    //   setEmergencyFriends([
    //     { uid: 'test1' , name : 'Zeynep Gulal', gps : '41.4542,56.7687'},
    //   ]);
    // }, []);

  useEffect(() => {
    if (!currentUID) return;

    const loadEmergencyFriends = async () => {
      try {
        const friendListRef = database().ref(
          `friendships/${currentUID}/friendList`
        );
        const friendSnap = await friendListRef.once('value');
        const friendMap = friendSnap.exists() ? friendSnap.val() : {};
        const friendUIDs = Object.keys(friendMap);

        const emergenciesRef = database().ref('emergencies');
        emergenciesRef.on('value', async (snapshot) => {
          const allEmergencies = snapshot.val() || {};
          const activeFriends = [];

          for (const [deviceId, emergencyData] of Object.entries(
            allEmergencies
          )) {
            const uid = emergencyData.uid;
            if (friendUIDs.includes(uid)) {
              const profileSnap = await database()
                .ref(`users/${uid}/publicProfile`)
                .once('value');
              const profile = profileSnap.val();

              const name =
                profile?.displayName ||
                `${profile?.firstName || ''} ${
                  profile?.lastName || ''
                }`.trim() ||
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
      } catch (error) {
        console.error('Error loading emergency friends:', error);
      }
    };

    loadEmergencyFriends();
  }, [currentUID]);

  return (
    <ImageBackground
      source={require('../assets/Background.jpeg')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.container}>
        <Text style={styles.title}>🚨 Emergency Friends</Text>

        <ScrollView style={styles.list}>
          {emergencyFriends.length === 0 ? (
            <View style={styles.friendItem}>
              <Text style={styles.noCallText}>
                Currently, there is no emergency call.
              </Text>
            </View>
          ) : (
            emergencyFriends.map((friend) => (
              <View key={friend.uid} style={styles.friendItem}>
                <Text style={styles.friendText}> {friend.name ? friend.name : 'The person in emergency'}</Text>
                <Text style={styles.gpsText}>{friend.gps ? `📍${friend.gps}` : '⏳ Waiting for GPS fix...'}</Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.mapContainer}>
          <WebView
            ref={webViewRef}
            source={{ uri: 'file:///android_asset/map_tracker.html' }}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            style={styles.map}
            onLoadEnd={() => console.log('✅ Map loaded')}
            onError={(e) => console.log('❌ WebView error:', e.nativeEvent)}
          />
        </View>
      </View>
    </ImageBackground>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginVertical: 24,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    marginRight: 7,
  },
  list: {
    maxHeight: 250,
    marginBottom: 16,
  },
  friendItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'column',
    marginTop: 20,
  },
  friendText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  gpsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#555',
    marginLeft: 2,
  },
  mapContainer: {
    height: 440,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    marginBottom: 115,
  },
  map: {
    flex: 1,
  },
  noCallText: {
    fontSize: 24,
    color: '#1a1a1a',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
