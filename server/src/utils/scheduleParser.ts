import * as chrono from "chrono-node";

export function detectScheduleCommand(message: string) {

  const commands = [
    "메모해줘",
    "기억해줘",
    "메모해",
    "기억해"
  ];

  return commands.some(cmd => message.includes(cmd));

}

export function parseSchedule(message: string) {

  const parsedDate = chrono.parseDate(message, new Date(), {
    forwardDate: true
  });

  let scheduleDate;

  if (parsedDate) {
    scheduleDate = parsedDate.toISOString().slice(0,10);
  } else {
    scheduleDate = new Date().toISOString().slice(0,10);
  }

  const cleaned = message
    .replace(/메모해줘|기억해줘|메모해|기억해/g,"")
    .trim();

  return {
    title: cleaned,
    scheduleDate
  };

}