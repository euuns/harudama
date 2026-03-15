import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Calendar } from 'react-native-calendars';
import AsyncStorage from "@react-native-async-storage/async-storage";

type Schedule = {
  id: number;
  title: string;
  schedule_date: string;
  status: string;
  related_chat?: string;
};

export default function CalendarScreen() {

  const today = new Date().toISOString().slice(0,10);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(today);

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {

      const token = await AsyncStorage.getItem("token");

      if (!token) {
        console.log("로그인 토큰 없음");
        return;
      }

      const res = await fetch("http://10.0.2.2:3000/api/calendar", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();

      console.log("calendar data:", data);

      setSchedules(data);

    } catch (err) {

      console.log("calendar fetch error", err);

    }
  };

  const filteredSchedules = schedules.filter(
    s => s.schedule_date === selectedDate
  );

  const markedDates = schedules.reduce((acc: any, cur) => {

    acc[cur.schedule_date] = {
      marked: true,
      dotColor: "#007AFF"
    };

    return acc;

  }, {});

  return (

    <View style={styles.container}>

      <Text style={styles.title}>달력</Text>

      <Calendar
        markedDates={{
          ...markedDates,
          [selectedDate]: {
            selected: true
          }
        }}
        onDayPress={(day) => {
          setSelectedDate(day.dateString);
        }}
      />

      <View style={styles.listContainer}>

        <Text style={styles.dateTitle}>
          {selectedDate} 일정
        </Text>

        <FlatList
          data={filteredSchedules}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <Text style={{padding:10}}>일정 없음</Text>
          }
          renderItem={({ item }) => (

            <View style={styles.item}>

              <Text style={styles.itemTitle}>
                {item.title}
              </Text>

              {item.related_chat && (
                <Text style={styles.chat}>
                  관련 채팅: {item.related_chat}
                </Text>
              )}

            </View>

          )}
        />

      </View>

    </View>

  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff"
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10
  },
  listContainer: {
    flex: 1,
    marginTop: 10
  },
  dateTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },
  itemTitle: {
    fontSize: 15
  },
  chat: {
    fontSize: 12,
    color: "#666",
    marginTop: 4
  }
});