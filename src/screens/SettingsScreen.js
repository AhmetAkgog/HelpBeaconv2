import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import Icon from 'react-native-vector-icons/Feather';

const LOGO_RED = '#FF1010';

const SettingsScreen = () => {
  const currentUser = auth().currentUser;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(currentUser?.email || '');

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const snap = await database().ref(`users/${currentUser.uid}/publicProfile`).once('value');
        const data = snap.val();
        setFirstName(data?.firstName || '');
        setLastName(data?.lastName || '');
      } catch (e) {
        console.error('Error fetching data:', e);
      }
    };
    fetchUserData();
  }, []);

  const handleSave = async () => {
    try {
      await database().ref(`users/${currentUser.uid}/publicProfile`).update({ firstName, lastName });
      Alert.alert('Success', 'Changes saved');
    } catch (e) {
      Alert.alert('Error', 'Failed to save changes');
    }
  };

  const handleDelete = async () => {
    try {
      await database().ref(`users/${currentUser.uid}`).remove();
      await currentUser.delete();
      Alert.alert('Deleted', 'Account deleted successfully');
    } catch (e) {
      Alert.alert('Error', 'Re-authenticate to delete your account');
    }
  };

  const handleLogout = async () => {
    try {
      await auth().signOut();
      Alert.alert('Logged out', 'You have been logged out.');
    } catch (error) {
      console.error('Logout error:', error);
      Alert.alert('Error', 'Failed to log out.');
    }
  };

  return (    <ImageBackground
      source={require('../assets/Background.jpeg')}
      style={styles.background}
      resizeMode="cover"
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={styles.overlay} />

      <SafeAreaView style={styles.cardWrapper}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.header}>⚙️ Settings</Text>

          <View style={styles.card}>
            <TextInput
              placeholder="First Name"
              placeholderTextColor="#666"
              style={styles.input}
              onChangeText={setFirstName}
              value={firstName}
            />
            <TextInput
              placeholder="Last Name"
              placeholderTextColor="#666"
              style={styles.input}
              onChangeText={setLastName}
              value={lastName}
            />
            <TextInput
              placeholder="Email"
              placeholderTextColor="#666"
              style={[styles.input, { backgroundColor: '#e0e0e0' }]}
              value={email}
              editable={false}
            />
            <TouchableOpacity style={styles.button} onPress={handleSave}>
              <View style={styles.buttonContent}>
                <Icon name="save" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Save</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={handleDelete}>
              <View style={styles.buttonContent}>
                <Icon name="trash" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Delete Account</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
              <View style={styles.buttonContent}>
                <Icon name="log-out" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Log Out</Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  background: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  cardWrapper: {
    flex: 1,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    marginTop: 20,
    marginBottom: 40,
  },
  header: {
    marginTop : 100,
      fontSize: 30,
      fontWeight: 'bold',
      color: '#fff',
      textAlign: 'center',
      marginVertical: 24,
      textShadowColor: '#000',
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: LOGO_RED,
    padding: 12,
    marginBottom: 16,
    borderRadius: 10,
    backgroundColor: '#fff',
    color: '#000',
  },
  button: {
    backgroundColor: LOGO_RED,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteButton: {
    backgroundColor: '#999',
  },
  logoutButton: {
    backgroundColor: '#333',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
