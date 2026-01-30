import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import login from './src/screens/login';
import calendar from './src/screens/calendar';
import AiScreen from './src/screens/AiScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="로그인"  // ✅ 앱 첫 화면 = 로그인
        screenOptions={{
          headerTitleAlign: 'center',
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tab.Screen name="로그인" component={login} />
        <Tab.Screen name="달력" component={calendar} />
        <Tab.Screen name="AI" component={AiScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
