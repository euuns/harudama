import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
// Settings 탭 내에서 스택 이동을 위해 native-stack 네비게이터 추가
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './src/config/api';

//로그인 전 화면
import AuthStack from './src/screens/auth/authStack'; //로그인, 회원가입, 비번찾기(미구현), 카카오로 가입(미구현)

// 로그인 이후 화면
import calendar from './src/screens/calendar'; //달력화면
import AiScreen from './src/screens/AiScreen'; //AI화면
import Settings from './src/screens/Settings/Settings'; //설정화면
import Myinfo from './src/screens/Settings/myinfo'; //내 정보 화면

const Tab = createBottomTabNavigator();
// Settings 탭 내부 네비게이터 객체 생성
const SettingsStack = createNativeStackNavigator();

//Settings 탭 전용 스택 네비게이터 컴포넌트
function SettingsStackScreen() {
  return (
    <SettingsStack.Navigator>
      {/* 기존 설정 메인 화면 */}
      <SettingsStack.Screen
        name="SettingsMain"
        component={Settings}
        options={{ headerShown: false }} // 탭 네비게이터의 헤더가 이미 있으므로 스택 자체의 헤더는 숨김
      />
      {/* 내 정보 화면 */}
      <SettingsStack.Screen
        name="MyInfo"
        component={Myinfo}
        options={{ title: '내 정보' }} // 스택 이동 시 '내 정보'라는 헤더 타이틀 표시
      />
    </SettingsStack.Navigator>
  );
}

// 로그인/로그아웃 상태 관리를 위한 AuthContext 
export const AuthContext = React.createContext<{
  signIn: () => void;
  signOut: () => void;
}>({
  signIn: () => { },
  signOut: () => { },
});

export default function App() {

  // 로그인 상태 변수 초기값 null
  const [isLogin, setIsLogin] = React.useState<boolean | null>(null); 

  React.useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken'); //기기 저장소에서 토큰 정보 꺼냄
        
        if (!token) { // 토큰이 없다면 로그인 상태 값 false
          setIsLogin(false);
          return;
        }

        // 토큰이 있으면 서버에 유효한지 검증
        const response = await fetch(`${API_BASE}/api/auth/authcheck`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // 헤더에 토큰 첨부
          }
        });

        const result = await response.json();
        if (response.ok && result.ok) {
          // 토큰 유효 -> 로그인 상태 유지
          setIsLogin(true);
        } else {
          // 토큰 만료 또는 유효하지 않음 -> 로그아웃 처리
          await AsyncStorage.removeItem('userToken');
          setIsLogin(false);
        }

      } catch (err) {
        console.error('토큰 검증 에러:', err);
        // 네트워크 에러 등 발생 시 일단 비로그인 처리
        setIsLogin(false);
      }
    };

    checkToken();
  }, []);

  // 하위 스크린에서 상태를 바꿀 수 있는 함수 제공
  const authContext = React.useMemo(
    () => ({
      signIn: () => setIsLogin(true),
      signOut: async () => {
        await AsyncStorage.removeItem('userToken');
        setIsLogin(false);
      },
    }),
    []
  );

  // 검증 중일 때는 빈 화면이나 스피너를 보여줄 수 있습니다.
  if (isLogin === null) {
    return null; // 잠시 대기
  }

  return (
    <AuthContext.Provider value={authContext}>
      <NavigationContainer>
        {/* isLogin 상태에 따라 네비게이터를 다르게 보여줍니다. */}
        {isLogin ? (
          //  로그인 된 유저가 보는 메인 탭 화면 
          <Tab.Navigator
            initialRouteName="달력"
            screenOptions={{
              headerTitleAlign: 'center',
              tabBarLabelStyle: { fontSize: 12 },
            }}
          >
            <Tab.Screen name="달력" component={calendar} />
            <Tab.Screen name="AI" component={AiScreen} />
            <Tab.Screen name="설정" component={SettingsStackScreen} />
          </Tab.Navigator>
        ) : (
          //  로그인 되지 않은 유저가 보는 화면 (로그인/회원가입)
          <AuthStack />
        )}
      </NavigationContainer>
    </AuthContext.Provider>
  );
}
