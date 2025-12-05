import React, { useState } from 'react';
import {
  SafeAreaView,
  Text,
  StyleSheet,
  TextInput,
  Button,
  View,
  ScrollView,
} from 'react-native';

const API_BASE = 'http://10.0.2.2:4000'; // 에뮬 기준 서버 주소

export default function App() {
  const [input, setInput] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    try {
      setLoading(true);
      setErrorMsg(null);
      setReply(null);

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test-user-1',
          message: input.trim(),
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        setErrorMsg(json.error || '서버 오류가 발생했어.');
        return;
      }

      setReply(json.reply?.content ?? '(내용 없음)');
    } catch (e) {
      console.log(e);
      setErrorMsg('서버 연결 실패 😢');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>하루담아 · AI 테스트</Text>

      <View style={styles.inputBox}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="AI에게 하고 싶은 말을 적어보세요"
          multiline
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          keyboardType="default"
          textBreakStrategy="simple"
        />
        <Button
          title={loading ? '생각 중...' : '보내기'}
          onPress={sendMessage}
          disabled={loading || !input.trim()}
        />
      </View>

      <ScrollView style={styles.resultBox}>
        {errorMsg ? (
          <Text style={styles.error}>{errorMsg}</Text>
        ) : reply ? (
          <>
            <Text style={styles.label}>AI 응답</Text>
            <Text style={styles.reply}>{reply}</Text>
          </>
        ) : (
          <Text style={styles.placeholder}>
            위에 메시지를 입력하고 보내기를 눌러보세요.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  inputBox: {
    marginBottom: 16,
    gap: 8,
  },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },
  resultBox: {
    flex: 1,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  reply: {
    fontSize: 15,
    lineHeight: 22,
  },
  placeholder: {
    fontSize: 14,
    color: '#999',
  },
  error: {
    fontSize: 14,
    color: 'red',
  },
});
