import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  Text,
  StyleSheet,
  TextInput,
  Button,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config/api';

type RoomItem = {
  id: number;
  title: string | null;
  createdAt: string;  
};

export default function AiScreen() {
  const [input, setInput] = useState('');
  const [reply, setReply] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [roomId, setRoomId] = useState<number | null>(null);

  const [roomTitle, setRoomTitle] = useState('');

  const headers = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  const ensureAnonUserId = async (): Promise<string> => {
    const saved = await AsyncStorage.getItem('anonUserId');
    if (saved) return saved;

    const res = await fetch(`${API_BASE}/api/chat/anon`, { method: 'POST' });
    const json = await res.json();

    if (!json.ok || !json.userId) throw new Error('ANON_ISSUE_FAILED');

    await AsyncStorage.setItem('anonUserId', json.userId);
    return json.userId as string;
  };

  const loadRooms = async (uid: string) => {
    const res = await fetch(
      `${API_BASE}/api/chat/room?userId=${encodeURIComponent(uid)}`,
    );
    const json = await res.json();

    if (!json.ok) throw new Error(json.error || 'ROOM_LIST_FAILED');

    const items = (json.items || []) as RoomItem[];
    setRooms(items);
    return items;
  };

  const createRoom = async (uid: string, title?: string) => {
    const res = await fetch(`${API_BASE}/api/chat/room`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId: uid,
        title: title?.trim() || null,
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

        const uid = await ensureAnonUserId();
        setUserId(uid);

        const items = await loadRooms(uid);

        if (items.length > 0) {
          setRoomId(items[0].id);
        } else {
          const newRoomId = await createRoom(uid, '기본 채팅방');
          await loadRooms(uid);
          setRoomId(newRoomId);
        }
      } catch (e) {
        console.log(e);
        setErrorMsg('초기화 실패: 서버 연결/설정 확인 필요');
      }
    })();
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    if (!userId) return setErrorMsg('userId 없음');
    if (!roomId) return setErrorMsg('roomId 없음(채팅방을 선택/생성하세요)');

    try {
      setLoading(true);
      setErrorMsg(null);
      setReply(null);

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          roomId,
          message: input.trim(),
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        setErrorMsg(json.error || '서버 오류가 발생했어.');
        return;
      }

      setReply(json.assistant?.content ?? '(내용 없음)');
      setInput('');
    } catch (e) {
      console.log(e);
      setErrorMsg('서버 연결 실패 😢');
    } finally {
      setLoading(false);
    }
  };

  const onCreateRoomPress = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setErrorMsg(null);

      const newRoomId = await createRoom(userId, roomTitle || '새 채팅방');

      setRoomTitle('');
      await loadRooms(userId);

      setRoomId(newRoomId);
      setReply(null);
    } catch (e: any) {
      console.log(e);
      setErrorMsg(e?.message || '방 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>AI</Text>

      <Text style={styles.sub}>userId: {userId ? userId : '(loading...)'}</Text>

      <View style={styles.roomBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {rooms.map((r) => {
            const active = r.id === roomId;

            return (
              <TouchableOpacity
                key={r.id}
                onPress={() => {
                  setRoomId(r.id);
                  setReply(null);
                }}
                style={[styles.roomChip, active && styles.roomChipActive]}
              >
                <Text
                  style={[
                    styles.roomChipText,
                    active && styles.roomChipTextActive,
                  ]}
                >
                  {r.title ? r.title : `방 #${r.id}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.newRoomBox}>
        <TextInput
          style={styles.roomInput}
          value={roomTitle}
          onChangeText={setRoomTitle}
          placeholder="새 채팅방 제목(선택)"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Button
          title="방 만들기"
          onPress={onCreateRoomPress}
          disabled={loading || !userId}
        />
      </View>

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
          <Text style={styles.placeholder}>방을 선택하고 메시지를 보내보세요.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 10 },

  roomBar: { marginBottom: 10 },
  roomChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#ddd', marginRight: 8,
  },
  roomChipActive: { borderColor: '#111' },
  roomChipText: { fontSize: 13, color: '#666' },
  roomChipTextActive: { color: '#111', fontWeight: '600' },

  newRoomBox: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  roomInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },

  inputBox: { marginBottom: 16, gap: 8 },
  input: {
    minHeight: 80, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, textAlignVertical: 'top',
  },

  resultBox: { flex: 1, marginTop: 8 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  reply: { fontSize: 15, lineHeight: 22 },

  placeholder: { fontSize: 14, color: '#999' },
  error: { fontSize: 14, color: 'red' },
});
