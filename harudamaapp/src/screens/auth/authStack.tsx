import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import Login from './login';
import Signup from './signup';

const Stack = createNativeStackNavigator();

export type authStackParamList = {
  Login: undefined;
  Signup: undefined; 
};

export default function authStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="Signup" component={Signup} />
    </Stack.Navigator>
  );
}