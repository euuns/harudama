import React, { useState, useContext } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { authStackParamList } from '../auth/authStack';

import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 발급받은 JWT 토큰을 기기에 저장하기 위해 임포트

type LoginNavigationProp = NativeStackNavigationProp<authStackParamList, 'Login'>;
import { API_BASE } from '../../config/api';

// 로그인 상태 판단을 위한 AuthContext 가져오기
import { AuthContext } from '../../../App';

export default function myinfo() {
    const { signOut } = useContext(AuthContext);

    // 모달 표시 여부 및 비밀번호 상태
    const [modalVisible, setModalVisible] = useState(false);
    const [password, setPassword] = useState('');

    // [2026-03-08] 모달 닫을 때 비밀번호 초기화
    const closeModal = () => {
        setModalVisible(false);
        setPassword('');
    };

    // 회원탈퇴 처리 함수
    const handleWithdraw = async () => {
       
        if (!password) {
            Alert.alert('알림', '비밀번호를 입력해주세요.');
            return;
        }

        Alert.alert(
            '회원 탈퇴',
            '정말로 회원 탈퇴를 진행하시겠습니까? 탈퇴 후에는 계정을 복구할 수 없습니다.',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '탈퇴',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await AsyncStorage.getItem('userToken');

                            if (!token) {
                                Alert.alert('오류', '로그인 정보가 없습니다.');
                                return;
                            }

                            const response = await fetch(`${API_BASE}/api/auth/withdrawn`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({ password })
                            });

                            const result = await response.json();

                            if (response.ok && result.ok) {
                                Alert.alert('완료', '회원 탈퇴가 완료되었습니다.');
                                closeModal(); // 성공 시 모달 닫기
                                // 로그아웃 처리 (토큰 삭제 및 상태 변경)
                                await AsyncStorage.removeItem('userToken');
                                signOut();
                            } else {
                                Alert.alert('실패', result.message || '회원 탈퇴에 실패했습니다.');
                            }

                        } catch (error) {
                            console.error('Withdrawal error:', error);
                            Alert.alert('오류', '서버 통신 중 에러가 발생했습니다.');
                        }
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>내 정보</Text>

                {/* 추후 다른 사용자 정보가 들어갈 수 있는 공간 */}
                <View style={styles.infoArea}>
                    <Text style={styles.infoText}>개인정보 들어갈 예정</Text>
                </View>

                {/* 탈퇴 버튼 누르면 모달 띄우기 */}
                <TouchableOpacity style={styles.withdrawnButton} onPress={() => setModalVisible(true)}>
                    <Text style={styles.withdrawnText}>회원탈퇴</Text>
                </TouchableOpacity>
            </View>

            {/* 회원 탈퇴 모달창 */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={closeModal}
            >
                <View style={styles.modalOverlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        style={styles.modalView}
                    >
                        <Text style={styles.modalTitle}>비밀번호 확인</Text>
                        <Text style={styles.modalDescription}>
                            본인 확인을 위해 비밀번호를 입력해주세요.
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="비밀번호"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />

                        <View style={styles.modalButtonGroup}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closeModal}>
                                <Text style={styles.cancelText}>취소</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleWithdraw}>
                                <Text style={styles.confirmText}>탈퇴 진행</Text>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        flex: 1,
        padding: 20,
        justifyContent: 'flex-start',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 30,
        color: '#333',
    },
    infoArea: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 12,
        marginBottom: 40,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 3,
    },
    infoText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    withdrawnButton: {
        backgroundColor: '#EF4444',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 'auto',
        marginBottom: 20,
    },
    withdrawnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },

    // Modal 관련 스타일
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalView: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333',
        textAlign: 'center',
    },
    modalDescription: {
        fontSize: 14,
        color: '#666',
        marginBottom: 20,
        textAlign: 'center',
    },
    input: {
        width: '100%',
        height: 50,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        paddingHorizontal: 15,
        marginBottom: 20,
        fontSize: 16,
        backgroundColor: '#fafafa',
    },
    modalButtonGroup: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginHorizontal: 5,
    },
    cancelButton: {
        backgroundColor: '#f1f1f1',
    },
    confirmButton: {
        backgroundColor: '#EF4444',
    },
    cancelText: {
        color: '#555',
        fontSize: 16,
        fontWeight: '600',
    },
    confirmText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});