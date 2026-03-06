import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  Text,
  StyleSheet,
  TextInput,
  Button,
  View,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config/api';

export default function AiScreen() {
  const [input, setInput] = useState('');
  const [reply, setReply] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [roomTitle, setRoomTitle] = useState<string>('');

  const headers = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  /**
   * 로그인 후 저장된 user_id 읽기
   */
  const getStoredUserId = async (): Promise<string> => {
    const saved = await AsyncStorage.getItem('user_id');

    if (!saved || !saved.trim()) {
      throw new Error('LOGIN_USER_ID_NOT_FOUND');
    }

    return saved.trim();
  };

  /**
   * 방 제목: 현재 날짜/시간
   * 예: 2026-03-06 11:25
   */
  const makeRoomTitle = () => {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  const createRoom = async (uid: string, title: string) => {
    const res = await fetch(`${API_BASE}/api/chat/room`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: uid,
        title,
      }),
    });

    const json = await res.json();

    if (!json.ok) throw new Error(json.error || 'ROOM_CREATE_FAILED');

    return json.room?.id as number;
  };

  useEffect(() => {
    (async () => {
      try {
        setErrorMsg(null);
        setReply(null);

        const uid = await getStoredUserId();
        setUserId(uid);

        const title = makeRoomTitle();
        setRoomTitle(title);

        const newRoomId = await createRoom(uid, title);
        setRoomId(newRoomId);
      } catch (e) {
        setErrorMsg('회원 정보가 없거나 채팅방 생성에 실패했습니다. 로그인 상태를 확인해주세요.');
      }
    })();
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    if (!userId) return setErrorMsg('user_id 없음');
    if (!roomId) return setErrorMsg('roomId 없음(채팅방 생성 실패)');

    try {
      setLoading(true);
      setErrorMsg(null);
      setReply(null);

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: userId,
          roomId,
          message: input.trim(),
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        setErrorMsg(json.error || '서버 오류가 발생했습니다.');
        return;
      }

      setReply(json.assistant?.content ?? '(내용 없음)');
      setInput('');
    } catch (e) {
      setErrorMsg('서버 연결 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>AI</Text>

      <Text style={styles.sub}>
        user_id: {userId ? userId : '(loading...)'}
      </Text>

      <Text style={styles.sub}>
        방 제목: {roomTitle ? roomTitle : '(생성 중...)'}
      </Text>

      <View style={styles.inputBox}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="AI에게 하고 싶은 말을 적어보세요"
          multiline
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Button
          title={loading ? '생각 중...' : '보내기'}
          onPress={sendMessage}
          disabled={loading || !input.trim() || !userId || !roomId}
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
            메시지를 보내보세요.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 8 },

  inputBox: { marginBottom: 16, gap: 8 },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },

  resultBox: { flex: 1, marginTop: 8 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  reply: { fontSize: 15, lineHeight: 22 },

  placeholder: { fontSize: 14, color: '#999' },
  error: { fontSize: 14, color: 'red' },
});