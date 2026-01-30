import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function calendar() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>달력</Text>
      <Text style={styles.desc}>임시 달력 화면</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  desc: { fontSize: 14, opacity: 0.7 },
});
