import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  ImageBackground
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
      marginBottom: 100,
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
