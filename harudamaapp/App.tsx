import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text, StyleSheet } from 'react-native';

export default function App() {
  const [message, setMessage] = useState('서버에서 데이터 가져오는 중...');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('http://10.0.2.2:4000/hello');
        const json = await res.json();
        setMessage(json.message);
      } catch (e) {
        console.log(e);
        setMessage('서버 연결 실패 😢');
      }
    };

    load();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>하루담아</Text>
      <Text style={styles.msg}>{message}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, marginBottom: 20 },
  msg: { fontSize: 18 },
});