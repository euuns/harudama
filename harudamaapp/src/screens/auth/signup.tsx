import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation  } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { authStackParamList } from './authStack'; 

type LoginNavigationProp = NativeStackNavigationProp<authStackParamList, 'Login'>;
// import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../../config/api';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'M' | 'F' | null>(null);
  const navigation = useNavigation<LoginNavigationProp>();

  const handleSignup = async () => {
  // 프론트 단 값 검증 추후 개선 : 1.비밀번호 규칙 2.이메일 형식 검증 3.각각의 입력폼 입력 타입 강제하기
  if (!name || !email || !password || !birthDate || !gender) {
    alert('필수 항목을 입력해주세요');
    return;
  }

  if (password !== passwordConfirm) {
    alert('비밀번호가 일치하지 않습니다');
    return;
  }

  try { 
    const response = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        email,
        password,
        phoneNumber,
        birthDate,
        gender,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || '회원가입 실패');
      return;
    }

    alert('회원가입 성공!');
     navigation.navigate('Login'); 
  } catch (err) {
    console.error(err);
    alert('서버 연결 실패');
  }
};

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>회원가입</Text>

      {/* 이름 */}
      <TextInput
        style={styles.input}
        placeholder="이름"
        value={name}
        onChangeText={setName}
      />

      {/* 이메일 */}
      <TextInput
        style={styles.input}
        placeholder="이메일"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      {/* 휴대폰 번호 */}
      <TextInput
        style={styles.input}
        placeholder="휴대폰 번호 (- 없이)"
        keyboardType="phone-pad"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />

      {/* 비밀번호 */}
      <TextInput
        style={styles.input}
        placeholder="비밀번호"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {/* 비밀번호 확인 */}
      <TextInput
        style={styles.input}
        placeholder="비밀번호 확인"
        secureTextEntry
        value={passwordConfirm}
        onChangeText={setPasswordConfirm}
      />

      {/* 생년월일 */}
      <TextInput
        style={styles.input}
        placeholder="생년월일 (YYYY-MM-DD)"
        value={birthDate}
        onChangeText={setBirthDate}
      />

      {/* 성별 */}
      <View style={styles.genderBox}>
        <TouchableOpacity
          style={[
            styles.genderBtn,
            gender === 'M' && styles.genderSelected,
          ]}
          onPress={() => setGender('M')}
        >
          <Text>남</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.genderBtn,
            gender === 'F' && styles.genderSelected,
          ]}
          onPress={() => setGender('F')}
        >
          <Text>여</Text>
        </TouchableOpacity>
      </View>

      {/* 회원가입 버튼 */}
      <TouchableOpacity
        style={styles.signupBtn} 
        onPress={handleSignup}>
        <Text style={styles.signupText}>회원가입</Text>
      </TouchableOpacity>

      {/* 카카오 연계 대비 */}
      <Text style={styles.kakaoHint}>
        * 카카오 계정으로도 가입할 수 있어요
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 24,
    alignSelf: 'center',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  genderBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  genderBtn: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  genderSelected: {
    backgroundColor: '#eee',
    borderColor: '#999',
  },
  signupBtn: {
    height: 48,
    backgroundColor: '#222',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  signupText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  kakaoHint: {
    marginTop: 12,
    fontSize: 12,
    color: '#777',
    textAlign: 'center',
  },
});
