import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useColorScheme,
  Image,
  ImageBackground,
} from 'react-native';

import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import Icon from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LoginSignupScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }

    try {
      if (isLogin) {
        const userCredential = await auth().signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
          Alert.alert('Email Not Verified', 'Please verify your email before logging in.');
          await auth().signOut();
          return;
        }

        // ✅ Try to get the stored names (if any)
        const pendingFirstName = await AsyncStorage.getItem('pendingFirstName');
        const pendingLastName = await AsyncStorage.getItem('pendingLastName');

        const safeEmail = email.toLowerCase().replace(/\./g, ',');

        await database().ref(`users/${user.uid}/publicProfile`).set({
          firstName: pendingFirstName || '',
          lastName: pendingLastName || '',
          displayName: `${pendingFirstName || ''} ${pendingLastName || ''}`.trim(),
          email,
        });

        await database().ref(`users/${user.uid}/email`).set(email);
        await database().ref(`emailLookup/${safeEmail}`).set(user.uid);

        // ✅ Clean up storage so it's not reused
        await AsyncStorage.removeItem('pendingFirstName');
        await AsyncStorage.removeItem('pendingLastName');

        Alert.alert('Success', 'Logged in successfully!');
      } else {
        if (!firstName || !lastName) {
          Alert.alert('Error', 'Please enter your first and last name');
          return;
        }

        const userCredential = await auth().createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Send verification link
        await user.sendEmailVerification();

        Alert.alert(
          'Verify your email',
          'A verification link has been sent to your email. Please verify before logging in.'
        );

        // ❌ DO NOT write to Realtime Database yet

        // ✅ OPTIONAL: Store first/last name in AsyncStorage for later use
        // await AsyncStorage.setItem('pendingFirstName', firstName);
        // await AsyncStorage.setItem('pendingLastName', lastName);

        await AsyncStorage.setItem('pendingFirstName', firstName);
        await AsyncStorage.setItem('pendingLastName', lastName);

        await auth().signOut();
      }

    } catch (error) {
      console.log(error);
      Alert.alert('Authentication Error', error.message);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/Background.jpeg')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.cardWrapper}>
        <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />

        <Text style={styles.header}>
          {isLogin ? 'Login for Emergency Access' : 'Register for Emergency Access'}
        </Text>

        <View style={styles.card}>
          {!isLogin && (
            <>
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
            </>
          )}

          <TextInput
            placeholder="Email"
            placeholderTextColor="#666"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            value={email}
          />

          <View style={styles.passwordContainer}>
            <TextInput
              placeholder="Password"
              placeholderTextColor="#666"
              style={[styles.input, styles.passwordInput]}
              secureTextEntry={!showPassword}
              onChangeText={setPassword}
              value={password}
            />
            <TouchableOpacity onPress={() => setShowPassword(prev => !prev)} style={styles.toggleIcon}>
              <Icon name={showPassword ? 'eye' : 'eye-off'} size={22} color="#333" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleAuth}>
            <View style={styles.buttonContent}>
              <Icon name="log-in" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>
                {isLogin ? 'LOGIN' : 'SIGN UP'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
            <Text style={styles.toggleText}>
              {isLogin ? (
                <>Don't have an account? <Text style={styles.underlineBold}>Sign up</Text></>
              ) : (
                <>Already have an account? <Text style={styles.underlineBold}>Login</Text></>
              )}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
};

export default LoginSignupScreen;

const LOGO_RED = '#FF1010';

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  cardWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '90%',
    maxWidth: 400,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  logo: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginBottom: 12,
    borderRadius: 10,
  },
  header: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    color: '#2e2c2c',
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
  passwordContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 48,
  },
  toggleIcon: {
    position: 'absolute',
    right: 16,
    top: 15,
  },
  button: {
    backgroundColor: LOGO_RED,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
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
  toggleText: {
    textAlign: 'center',
    color: '#444',
    marginTop: 12,
  },
  underlineBold: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
