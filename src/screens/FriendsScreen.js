import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Image,
  ImageBackground,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';

const FriendsScreen = () => {
  const [friendEmail, setFriendEmail] = useState('');
  const [friendList, setFriendList] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const currentUID = auth().currentUser?.uid;
  const [activeTab, setActiveTab] = useState('friends');
  const { user, authInitialized } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    if (authInitialized && !user) {
      navigation.navigate('Login');
    }
  }, [authInitialized, user]);

  useEffect(() => {
    if (!currentUID) return;

    const friendsRef = database().ref(`friendships/${currentUID}/friendList`);
    const listener = friendsRef.on('value', (snapshot) => {
      const data = snapshot.val();
      setFriendList(data ? Object.keys(data) : []);
    });

    return () => friendsRef.off('value', listener);
  }, [currentUID]);

  useEffect(() => {
    if (!currentUID) return;

    const ref = database().ref(`friendRequests/${currentUID}`);
    const listener = ref.on('value', (snap) => {
      const requests = snap.val() || {};
      console.log("📥 Friend request data:", requests);
      const incoming = Object.entries(requests)
        .filter(([_, val]) => val === 'received')
        .map(([uid]) => uid);
      console.log("📥 Incoming requests:", incoming);
      setIncomingRequests(incoming);
    });

    return () => ref.off('value', listener);
  }, [currentUID]);

  const sendFriendRequest = async () => {
    if (!friendEmail || friendEmail === auth().currentUser.email) {
      Alert.alert('Invalid email');
      return;
    }

    try {
      const safeEmail = friendEmail.toLowerCase().replace(/\./g, ',');
      const uidSnap = await database().ref(`emailLookup/${safeEmail}`).once('value');
      const foundUID = uidSnap.val();

      if (!foundUID) {
        Alert.alert('No user found with that email');
        return;
      }

      if (foundUID === currentUID) {
        Alert.alert('You cannot add yourself');
        return;
      }

      const alreadyFriend = await database()
        .ref(`friendships/${currentUID}/friendList/${foundUID}`)
        .once('value');
      if (alreadyFriend.exists()) {
        Alert.alert('Already friends');
        return;
      }

      await database().ref(`friendRequests/${currentUID}/${foundUID}`).set("pending");
      await database().ref(`friendRequests/${foundUID}/${currentUID}`).set("received");

      setFriendEmail('');
      Alert.alert('Friend request sent!');
    } catch (error) {
      console.error('Send request error:', error);
      Alert.alert('Error sending request');
    }
  };

  const acceptRequest = async (fromUID) => {
    try {
      const updates = {};
      updates[`friendships/${currentUID}/friendList/${fromUID}`] = true;
      updates[`friendships/${fromUID}/friendList/${currentUID}`] = true;
      updates[`friendRequests/${currentUID}/${fromUID}`] = null;
      updates[`friendRequests/${fromUID}/${currentUID}`] = null;

      await database().ref().update(updates);
      console.log('🎉 Friend accepted successfully!');
    } catch (err) {
      console.error('❌ Error accepting friend:', err);
      Alert.alert('Error accepting request');
    }
  };

  const declineRequest = async (fromUID) => {
    await database().ref(`friendRequests/${currentUID}/${fromUID}`).remove();
    await database().ref(`friendRequests/${fromUID}/${currentUID}`).remove();
  };

  const removeFriend = async (uidToRemove) => {
    try {
      const updates = {};
      updates[`friendships/${currentUID}/friendList/${uidToRemove}`] = null;
      updates[`friendships/${uidToRemove}/friendList/${currentUID}`] = null;
      await database().ref().update(updates);
    } catch (err) {
      console.error("❌ Error removing friend:", err);
      Alert.alert("Error removing friend");
    }
  };

  const FriendItem = ({ uid, request }) => {
    const [name, setName] = useState(null);

    useEffect(() => {
      const fetchName = async () => {
        try {
          const snap = await database().ref(`users/${uid}/publicProfile`).once('value');
          const profile = snap.val();
          if (profile) {
            setName(profile.displayName || `${profile.firstName} ${profile.lastName}`);
          } else {
            setName('Unknown user');
          }
        } catch (err) {
          console.error('Error loading profile:', err);
          setName('Error loading');
        }
      };
      fetchName();
    }, [uid]);

    return (
          <View style={styles.friendCard}>
            <View style={styles.friendInfo}>
              <Image source={require('../assets/user-icon.png')} style={styles.avatar} />
              <View>
                <Text style={styles.friendName}>{name}</Text>
                <Text style={styles.friendLabel}>{request ? 'Friend Request' : 'Friend'}</Text>
              </View>
            </View>
            {request ? (
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(uid)}>
                  <Text style={styles.acceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeBtn} onPress={() => declineRequest(uid)}>
                  <Text style={styles.removeText}>Decline</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.removeBtn} onPress={() => removeFriend(uid)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      };

      return (
        <ImageBackground
          source={require('../assets/Background.jpeg')}
          style={{ flex: 1 }}
          resizeMode="cover"
        >
          <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
          <View style={styles.overlay} />
          <SafeAreaView style={styles.container}>
            <Text style={styles.title}><Icon name="users" size={24} color="#fff" /> My Friends</Text>
            <View style={styles.inputRow}>
              <TextInput
                placeholder=" Enter friend's email"
                placeholderTextColor="#aaa"
                value={friendEmail}
                onChangeText={setFriendEmail}
                style={styles.input}
              />
              <TouchableOpacity style={styles.addBtn} onPress={sendFriendRequest}>
                <Text style={styles.addText}>Send</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.tabRow}>
              <TouchableOpacity onPress={() => setActiveTab('friends')} style={[styles.tabButton, activeTab === 'friends' && styles.activeTab]}>
                <Text style={styles.tabText}>Friends</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setActiveTab('requests')} style={[styles.tabButton, activeTab === 'requests' && styles.activeTab]}>
                <Text style={styles.tabText}>Requests</Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'friends' ? (
              friendList.length > 0 ? (
                <FlatList
                  data={friendList}
                  keyExtractor={(uid) => uid}
                  renderItem={({ item }) => <FriendItem uid={item} />}
                />
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyEmoji}>🙁</Text>
                  <Text style={styles.emptyText}>No friends yet</Text>
                  <Text style={styles.emptySubtext}>Start adding some!</Text>
                </View>
              )
            ) : (
              incomingRequests.length > 0 ? (
                <FlatList
                  data={incomingRequests}
                  keyExtractor={(uid) => uid}
                  renderItem={({ item }) => <FriendItem uid={item} request />}
                />
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyEmoji}>📭</Text>
                  <Text style={styles.emptyText}>No requests</Text>
                </View>
              )
            )}
          </SafeAreaView>
        </ImageBackground>
      );
    };

    export default FriendsScreen;


    const styles = StyleSheet.create({
      container: { flex: 1, padding: 16 },
      title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginVertical: 20,
        textShadowColor: '#000',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 4,
      },
      inputRow: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        alignItems: 'center',
        marginTop : 20,
        elevation: 2,
      },
      input: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 10,
        fontSize: 16,
      },
      addBtn: {
        backgroundColor: '#E53935',
        paddingHorizontal: 26,
        paddingVertical: 16,
        borderTopRightRadius : 16,
        borderBottomRightRadius : 16,
      },
      addText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
      },
      tabRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop : 40,
      },
      tabButton: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        marginHorizontal: 8,
        borderBottomWidth: 2,
        borderColor: 'transparent',
      },
      activeTab: {
        borderColor: '#E53935',
      },
      tabText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1a1a1a',
      },
      friendCard: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        elevation: 3,
      },
      friendInfo: {
        flexDirection: 'row',
        alignItems: 'center',
      },
      friendName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1a1a1a',
      },
      friendLabel: {
        fontSize: 14,
        color: '#777',
      },
      avatar: {
        width: 53,
        height: 53,
        borderRadius: 24,
        marginRight: 12,
      },
      removeBtn: {
        borderWidth: 1,
        borderColor: '#E53935',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
      },
      acceptBtn: {
        borderWidth: 1,
        borderColor: 'green',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        marginRight: 6,
      },
      removeText: { color: '#E53935', fontWeight: '600' },
      acceptText: { color: 'green', fontWeight: '600' },
    emptyBox: {
      marginTop: 30,
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.95)',
      padding: 24,
      borderRadius: 16,
      elevation: 3,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
      emptyEmoji: {
        fontSize: 40,
        marginBottom: 10,
        color : '#ffff'
      },
      emptyText: {
        fontSize: 22,
        fontWeight: '700',
        color: '#333',
        textAlign: 'center',
      },
      emptySubtext: {
        fontSize: 18,
        color: '#777',
        textAlign: 'center',
        marginTop: 4,
      },
    });