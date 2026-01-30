import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function login() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>로그인</Text>
      <Text style={styles.desc}>로그인 화면2</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  desc: { fontSize: 14, opacity: 0.7 },
});
