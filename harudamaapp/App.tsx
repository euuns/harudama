import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import AuthStack from './src/screens/auth/authStack';
import calendar from './src/screens/calendar';
import AiScreen from './src/screens/AiScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const isLogin = false; // 로그인 여부 제어 변수
  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="로그인"  // ✅ 앱 첫 화면 = 로그인
        screenOptions={{
          headerTitleAlign: 'center',
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tab.Screen name="로그인" component={AuthStack} />
        <Tab.Screen name="달력" component={calendar} />
        <Tab.Screen name="AI" component={AiScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
