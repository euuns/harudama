import React, { useState } from 'react';
import { useNavigation  } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { authStackParamList } from './authStack'; 

import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

type LoginNavigationProp = NativeStackNavigationProp<authStackParamList, 'Login'>;

export default function login() {
   const [id, setId] = useState('');
   const [password, setPassword] = useState('');
   const navigation = useNavigation<LoginNavigationProp>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>로그인</Text>

       {/* 아이디입력칸 */}
      <TextInput
        style={styles.input}
        placeholder="휴대폰 번호 또는 이메일"
        value={id}
        onChangeText={setId}
        keyboardType="email-address"
        autoCapitalize="none"
      />
     
      {/* 비번입력칸 */}
      <TextInput
          style={styles.input}
          placeholder="비밀번호"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

      {/* 로긴 버튼 */}
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>로그인</Text>
      </TouchableOpacity>
      
      {/* 회원가입 화면 이동 버튼 */}
      <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
        <Text style={styles.linkText}>회원가입</Text>
      </TouchableOpacity>

  <Text style={styles.divider}>|</Text>

  <TouchableOpacity>
    <Text style={styles.linkText}>비밀번호 찾기</Text>
  </TouchableOpacity>
    </View>
    
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  desc: { fontSize: 14, opacity: 0.7 },
  input: {
    height: 48,
    width:'60%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    height: 48,
    width:'60%',
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
    linkText: {
    fontSize: 14,
    color: '#4F46E5',
  },
    divider: {
    marginHorizontal: 12,
    color: '#999',
  },
});
