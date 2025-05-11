import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native'
// force touc

const FriendsScreen = () => {
  const [friendEmail, setFriendEmail] = useState('');
  const [friendList, setFriendList] = useState([]);
  const currentUID = auth().currentUser?.uid;

  const { user, authInitialized } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    if (authInitialized && !user) {
      navigation.navigate('Login'); // force redirect
    }
  }, [authInitialized, user]);

  useEffect(() => {
    if (!currentUID) return;

    const friendsRef = database().ref(`friendships/${currentUID}/friendList`);
    const listener = friendsRef.on('value', (snapshot) => {
      const data = snapshot.val();
      // ✅ Extract UIDs from object keys
      setFriendList(data ? Object.keys(data) : []);
    });

    return () => friendsRef.off('value', listener);
  }, [currentUID]);

  const addFriend = async () => {
    if (!friendEmail || friendEmail === auth().currentUser.email) {
      Alert.alert('Invalid email');
      return;
    }

    try {
      const safeEmail = friendEmail.toLowerCase().replace(/\./g, ',');
      const uidSnap = await database()
        .ref(`emailLookup/${safeEmail}`)
        .once('value');
      const foundUID = uidSnap.val();

      if (!foundUID) {
        Alert.alert('No user found with that email');
        return;
      }

      if (foundUID === currentUID) {
        Alert.alert('You cannot add yourself');
        return;
      }

      // ✅ Write as map entry: friendList/uid = true
      await database()
        .ref(`friendships/${currentUID}/friendList/${foundUID}`)
        .set(true);

      setFriendEmail('');
    } catch (error) {
      console.error('Add friend error:', error);
      Alert.alert('Error adding friend');
    }
  };

  const removeFriend = async (uidToRemove) => {
    await database()
      .ref(`friendships/${currentUID}/friendList/${uidToRemove}`)
      .remove();
  };

  const FriendItem = ({ uid }) => {
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
      <View style={styles.friendItem}>
        <Text>{name || 'Loading...'}</Text>
        <TouchableOpacity onPress={() => removeFriend(uid)}>
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>👥 My Friends</Text>

      <View style={styles.inputRow}>
        <TextInput
          placeholder="Enter friend's email"
          value={friendEmail}
          onChangeText={setFriendEmail}
          style={styles.input}
        />
        <TouchableOpacity style={styles.addButton} onPress={addFriend}>
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={friendList}
        keyExtractor={(uid) => uid}
        renderItem={({ item }) => <FriendItem uid={item} />}
        ListEmptyComponent={<Text style={styles.empty}>No friends yet.</Text>}
      />
    </View>
  );
};

export default FriendsScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  inputRow: { flexDirection: 'row', marginBottom: 20 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 8,
  },
  addButton: {
    marginLeft: 10,
    backgroundColor: '#1e90ff',
    paddingHorizontal: 15,
    justifyContent: 'center',
    borderRadius: 8,
  },
  addText: { color: 'white', fontWeight: 'bold' },
  friendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  removeText: { color: 'red', fontWeight: 'bold' },
  empty: { textAlign: 'center', marginTop: 20, color: '#999' },
});
