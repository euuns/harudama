import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
// App.tsx에서 생성한 AuthContext를 가져옵니다.
import { AuthContext } from '../../App';

export default function Settings() {
    const { signOut } = useContext(AuthContext);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>설정</Text>

            {/* 로그아웃 버튼 클릭 시 AuthContext의 signOut 함수 실행 */}
            <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
                <Text style={styles.logoutText}>로그아웃</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: '#fff',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 40,
    },
    logoutButton: {
        backgroundColor: '#EF4444', // 빨간색 계열
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    logoutText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
