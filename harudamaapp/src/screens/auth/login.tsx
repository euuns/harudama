import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { authStackParamList } from './authStack';

import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 발급받은 JWT 토큰을 기기에 저장하기 위해 임포트

type LoginNavigationProp = NativeStackNavigationProp<authStackParamList, 'Login'>;
import { API_BASE } from '../../config/api';

// 로그인 상태 판단을 위한 AuthContext 가져오기
import { AuthContext } from '../../../App';

export default function login() {
  const [id, setId] = useState(''); //이메일 또는 휴대전화번호 값을 받음
  const [password, setPassword] = useState('');
  
  const navigation = useNavigation<LoginNavigationProp>();
  const { signIn } = React.useContext(AuthContext); // Context에서 signIn 함수 가져오기

  const handleLogin = async () => {
    try {
      // fetch 함수를 이용해 서버(API_BASE)의 '/api/auth/login' 경로에 로그인 요청
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          password,
        }),
      });

      const result = await response.json();
      console.log('login result = ', result);

      if (!response.ok) {
        alert(result.error || '로그인 실패');
        return;
      }

      // 서버로부터 정상적으로 토큰을 넘겨받았다면? AsyncStorage에 저장하여 자동로그인 처리에 활용
      if (result.token) {
        await AsyncStorage.setItem('userToken', result.token);
      } else {
        alert('토큰이 없습니다.');
        return;
      }

      // ** 추가: userId 저장 **
      const savedUserId =
      result.userId ??
      result.user?.userId ??
      result.user_id ??
      result.user?.user_id;

    if (savedUserId !== undefined && savedUserId !== null) {
      await AsyncStorage.setItem('user_id', String(savedUserId));
    } else {
      alert('로그인은 성공했지만 userId가 없습니다.');
      return;
    }

      alert('로그인 성공!');

      // 로그인 성공 시 AuthContext의 signIn()을 호출하여 로그인 상태로 변경
      signIn();

    } catch (err) {
      console.error(err);
      alert('서버 연결 실패');
    }
  };
  

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
        secureTextEntry // 비밀번호 * 처리
      />

      {/* 로그인 버튼: 누르면 위에서 작성한 handleLogin 함수 실행 */}
      <TouchableOpacity style={styles.button}
        onPress={handleLogin}>
        <Text style={styles.buttonText}>로그인</Text>
      </TouchableOpacity>

      {/* 하단 부가 기능 메뉴들을 묶어주는 컨테이너 (회원가입 | 비밀번호 찾기) */}
      <View style={styles.bottomLinksContainer}>
        <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.linkText}>회원가입</Text>
        </TouchableOpacity>

        <Text style={styles.divider}>|</Text>

        <TouchableOpacity>
          <Text style={styles.linkText}>비밀번호 찾기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  desc: { fontSize: 14, opacity: 0.7 },
  input: {
    height: 48,
    width: '60%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    height: 48,
    width: '60%',
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
  bottomLinksContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
});