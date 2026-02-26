import { format } from 'date-fns';

const TIME_KEYWORDS = ['time', 'current time', 'what time is it'];
const DATE_KEYWORDS = ['date', 'today', 'what is the date', "today's date"];

export const getDeterministicResponse = (input: string): string | null => {
  const normalizedInput = input.toLowerCase().trim();

  if (TIME_KEYWORDS.some(keyword => normalizedInput.includes(keyword))) {
    return `The current time is ${format(new Date(), 'pp')}.`;
  }

  if (DATE_KEYWORDS.some(keyword => normalizedInput.includes(keyword))) {
    return `Today is ${format(new Date(), 'PPPP')}.`;
  }

  return null;
};
