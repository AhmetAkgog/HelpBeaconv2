import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useColorScheme,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';

const LoginSignupScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }

    try {
      if (isLogin) {
        await auth().signInWithEmailAndPassword(email, password);
        Alert.alert('Success', 'Logged in successfully!');
      } else {
        if (!firstName || !lastName) {
          Alert.alert('Error', 'Please enter your first and last name');
          return;
        }

        const userCredential = await auth().createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        const safeEmail = email.toLowerCase().replace(/\./g, ',');

        await database().ref(`users/${user.uid}/publicProfile`).set({
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          email
        });

        await database().ref(`users/${user.uid}/email`).set(email);
        await database().ref(`emailLookup/${safeEmail}`).set(user.uid);

        Alert.alert('Success', 'Account created successfully!');
      }
    } catch (error) {
      console.log(error);
      Alert.alert('Authentication Error', error.message);
    }
  };

  return (
    <View style={[styles.container, isDark ? styles.darkContainer : styles.lightContainer]}>
      <Text style={[styles.header, isDark && styles.darkText]}>
        {isLogin ? 'Login' : 'Sign Up'}
      </Text>

      {!isLogin && (
        <>
          <TextInput
            placeholder="First Name"
            placeholderTextColor={isDark ? '#aaa' : '#666'}
            style={[styles.input, isDark && styles.darkInput]}
            onChangeText={setFirstName}
            value={firstName}
          />
          <TextInput
            placeholder="Last Name"
            placeholderTextColor={isDark ? '#aaa' : '#666'}
            style={[styles.input, isDark && styles.darkInput]}
            onChangeText={setLastName}
            value={lastName}
          />
        </>
      )}

      <TextInput
        placeholder="Email"
        placeholderTextColor={isDark ? '#aaa' : '#666'}
        style={[styles.input, isDark && styles.darkInput]}
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        value={email}
      />

      <TextInput
        placeholder="Password"
        placeholderTextColor={isDark ? '#aaa' : '#666'}
        style={[styles.input, isDark && styles.darkInput]}
        secureTextEntry
        onChangeText={setPassword}
        value={password}
      />

      <TouchableOpacity style={styles.button} onPress={handleAuth}>
        <Text style={styles.buttonText}>
          {isLogin ? 'Login' : 'Create Account'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
        <Text style={[styles.toggleText, isDark && styles.darkToggleText]}>
          {isLogin
            ? "Don't have an account? Sign up"
            : 'Already have an account? Login'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default LoginSignupScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  lightContainer: {
    backgroundColor: '#fff',
  },
  darkContainer: {
    backgroundColor: '#000',
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    color: '#000',
  },
  darkText: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
    color: '#000',
    backgroundColor: '#fff',
  },
  darkInput: {
    borderColor: '#555',
    backgroundColor: '#111',
    color: '#fff',
  },
  button: {
    backgroundColor: '#1e90ff',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  toggleText: {
    textAlign: 'center',
    color: '#333',
    marginTop: 12,
  },
  darkToggleText: {
    color: '#aaa',
  },
});
