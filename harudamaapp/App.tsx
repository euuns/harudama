// App.tsx
// 하루담아 · AI 테스트 (비로그인/기기별 anonUserId + 채팅방(room) + 대화 전송)
//
// ✅ 주요 기술/개념
// - React Native Hooks: useState / useEffect / useMemo
// - AsyncStorage: RN에서 localStorage 역할 (기기별 사용자 식별자 저장)
// - Fetch API: 서버(Express)와 통신
// - Platform 분기: iOS/Android 에뮬레이터에서 localhost 처리 방식 다름
// - 간단한 상태관리: 로딩/에러/응답/방 목록/현재 방 선택

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
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * API_BASE
 * - iOS 시뮬레이터: localhost가 Mac 호스트를 가리킴
 * - Android 에뮬레이터(AVD): 10.0.2.2가 호스트(PC)의 localhost를 가리킴
 */
const API_BASE =
  Platform.OS === 'ios'
    ? 'http://localhost:4000'
    : 'http://10.0.2.2:4000';

// 채팅방 목록 아이템 타입
type RoomItem = {
  id: number;
  title: string | null;
  createdAt: string;
};

export default function App() {
  /* =========================
   * 화면 상태(State)
   * ========================= */
  const [input, setInput] = useState('');
  const [reply, setReply] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 비로그인 유저를 구분하기 위한 기기 고유 userId (anon)
  const [userId, setUserId] = useState<string | null>(null);

  // 채팅방 목록 & 현재 선택된 방
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [roomId, setRoomId] = useState<number | null>(null);

  // 새 방 생성 시 입력하는 제목
  const [roomTitle, setRoomTitle] = useState('');

  // 요청 헤더 (메모이제이션해서 렌더링마다 객체 재생성 방지)
  const headers = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  /* =========================
   * API Helpers
   * ========================= */

  /**
   * 1) anon userId 확보 (기기별 1개)
   * - AsyncStorage에 저장되어 있으면 재사용
   * - 없으면 서버에서 발급(/api/chat/anon) 받아 저장
   */
  const ensureAnonUserId = async (): Promise<string> => {
    const saved = await AsyncStorage.getItem('anonUserId');
    if (saved) return saved;

    const res = await fetch(`${API_BASE}/api/chat/anon`, { method: 'POST' });
    const json = await res.json();

    if (!json.ok || !json.userId) throw new Error('ANON_ISSUE_FAILED');

    await AsyncStorage.setItem('anonUserId', json.userId);
    return json.userId as string;
  };

  /**
   * 2) 내 방 목록 로드
   * - userId 기준으로 서버에서 방 목록을 조회
   */
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

  /**
   * 3) 방 생성
   * - userId 기준으로 새 채팅방 생성
   * - title은 선택값(없으면 null)
   */
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

  /* =========================
   * 초기화: userId 확보 → 방 목록 → 방 선택
   * ========================= */
  useEffect(() => {
    (async () => {
      try {
        setErrorMsg(null);

        // (1) 기기별 anon userId 확보
        const uid = await ensureAnonUserId();
        setUserId(uid);

        // (2) 방 목록 로드
        const items = await loadRooms(uid);

        // (3) 방이 있으면 첫 번째 방 선택, 없으면 기본 방 생성 후 선택
        if (items.length > 0) {
          setRoomId(items[0].id);
        } else {
          const newRoomId = await createRoom(uid, '기본 채팅방');
          await loadRooms(uid);
          setRoomId(newRoomId);
        }
      } catch (e: any) {
        console.log(e);
        setErrorMsg('초기화 실패: 서버 연결/설정 확인 필요');
      }
    })();
  }, []);

  /* =========================
   * 5) 메시지 전송 (roomId 필수)
   * ========================= */
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

      // 서버 응답 구조: { ok:true, assistant:{ content: ... } }
      setReply(json.assistant?.content ?? '(내용 없음)');
      setInput('');
    } catch (e) {
      console.log(e);
      setErrorMsg('서버 연결 실패 😢');
    } finally {
      setLoading(false);
    }
  };

  /* =========================
   * 6) 새 방 만들기
   * ========================= */
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

  /* =========================
   * UI
   * ========================= */
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>하루담아 · AI 테스트</Text>

      {/* 현재 anon userId 표시 */}
      <Text style={styles.sub}>userId: {userId ? userId : '(loading...)'}</Text>

      {/* 방 선택 UI */}
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

      {/* 방 생성 */}
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

      {/* 메시지 입력 */}
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

      {/* 결과 영역 */}
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

/* =========================
 * Styles
 * ========================= */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },

  title: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },

  roomBar: { marginBottom: 10 },
  roomChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
  },
  roomChipActive: { borderColor: '#111' },
  roomChipText: { fontSize: 13, color: '#666' },
  roomChipTextActive: { color: '#111', fontWeight: '600' },

  newRoomBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  roomInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

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
