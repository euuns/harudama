import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
// App.tsx에서 생성한 AuthContext를 가져옵니다.
import { AuthContext } from '../../../App';
import { useNavigation } from '@react-navigation/native'; //네비게이션
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Myinfo from './myinfo';

//SettingsStack에서의 네비게이션 타입 정의
type SettingsStackParamList = {
    SettingsMain: undefined;
    MyInfo: undefined;
};
type SettingsNavigationProp = NativeStackNavigationProp<SettingsStackParamList, 'SettingsMain'>;

export default function Settings() {
    const { signOut } = useContext(AuthContext);
    
    const navigation = useNavigation<SettingsNavigationProp>(); //네비게이션 객체를 가져옴

    return (
        <View style={styles.container}>
            <Text style={styles.title}>설정</Text>

            {/* 개인정보 화면으로 이동 */}
            <TouchableOpacity style={styles.myInfoButton} onPress={() => navigation.navigate('MyInfo')}>
                <Text style={styles.myInfoText}>내 정보</Text>
            </TouchableOpacity>
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
        backgroundColor: '#EF4444',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    logoutText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },

    // '내 정보' 버튼 스타일 
    myInfoButton: {
        backgroundColor: '#4CAF50',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 8,
        marginBottom: 20,
    },
    myInfoText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
