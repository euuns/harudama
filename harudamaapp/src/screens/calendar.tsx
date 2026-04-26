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

function formatTime(dateStr: string): string {
  // "2026-04-26T23:00:00" → "23:00"
  const timePart = dateStr.slice(11, 16);
  return timePart;
}

function getTodayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export default function CalendarScreen() {

  const today = getTodayKst();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(today);

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");

      if (!token) {
        console.log("[Calendar] 토큰 없음");
        return;
      }

      const res = await fetch("http://10.0.2.2:4000/api/calendar", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const text = await res.text();
      const data = JSON.parse(text);

      if (Array.isArray(data)) {
        setSchedules(data);
      } else {
        console.log("[Calendar] 응답 오류:", data);
      }

    } catch (err) {
      console.log("[Calendar] fetch 오류:", err);
    }
  };

  const filteredSchedules = schedules.filter(s => {
    return s.schedule_date.slice(0, 10) === selectedDate;
  });

  const markedDates = schedules.reduce((acc: any, cur) => {
    const dateKey = cur.schedule_date.slice(0, 10);
    acc[dateKey] = {
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
              <View style={styles.itemHeader}>
                <Text style={styles.itemTime}>{formatTime(item.schedule_date)}</Text>
                <Text style={styles.itemTitle}>{item.title}</Text>
              </View>
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
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    minWidth: 40,
  },
  itemTitle: { 
    fontSize: 15,
  },
  chat: {
    fontSize: 12,
    color: "#666",
    marginTop: 4
  },
});