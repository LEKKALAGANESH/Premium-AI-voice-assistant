// Discovery Engine: Context-aware suggestion generation
// Adapts to active AI mode + time of day with infinite rotation

import type { VoxMode } from './modes';

export interface Suggestion {
  icon: string;
  title: string;
  subtitle: string;
  prompt: string;
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const TIME_SUGGESTIONS: Record<TimeOfDay, Suggestion[]> = {
  morning: [
    { icon: 'sun', title: 'Morning Briefing', subtitle: 'Start your day informed', prompt: 'Give me a quick morning briefing' },
    { icon: 'calendar', title: 'Plan My Day', subtitle: 'Organize your schedule', prompt: 'Help me plan my day' },
    { icon: 'coffee', title: 'Wake Me Up', subtitle: 'Something to spark curiosity', prompt: 'Tell me something fascinating to start my day' },
  ],
  afternoon: [
    { icon: 'zap', title: 'Quick Fact', subtitle: 'Learn something new', prompt: "Tell me an interesting fact I probably don't know" },
    { icon: 'lightbulb', title: 'Brainstorm', subtitle: 'Creative thinking partner', prompt: 'Help me brainstorm creative ideas' },
    { icon: 'list-checks', title: 'Productivity Tip', subtitle: 'Work smarter', prompt: 'Give me a productivity tip for the afternoon slump' },
  ],
  evening: [
    { icon: 'utensils-crossed', title: 'Dinner Ideas', subtitle: 'What should I cook?', prompt: 'Suggest something interesting for dinner tonight' },
    { icon: 'music', title: 'Wind Down', subtitle: 'Relaxation mode', prompt: 'Suggest a way to relax this evening' },
    { icon: 'heart', title: 'Gratitude Check', subtitle: 'Reflect on the day', prompt: 'Help me reflect on what went well today' },
  ],
  night: [
    { icon: 'moon', title: 'Bedtime Story', subtitle: 'A tale before sleep', prompt: 'Tell me a short, calming bedtime story' },
    { icon: 'brain', title: 'Deep Thoughts', subtitle: 'Late-night philosophy', prompt: 'Share a thought-provoking philosophical question' },
    { icon: 'star', title: 'Star Gazing', subtitle: 'Cosmic wonder', prompt: "What's visible in the night sky tonight?" },
  ],
};

const MODE_SUGGESTIONS: Record<VoxMode, Suggestion[]> = {
  assistant: [
    { icon: 'sparkles', title: 'Surprise Me', subtitle: 'Random fun fact', prompt: 'Surprise me with something fascinating' },
    { icon: 'globe', title: 'World Trivia', subtitle: 'Explore the globe', prompt: 'Tell me a surprising fact about a random country' },
    { icon: 'rocket', title: "Explain Like I'm 5", subtitle: 'Simple explanations', prompt: "Explain quantum physics like I'm five" },
    { icon: 'pen-tool', title: 'Write For Me', subtitle: 'Draft anything', prompt: 'Help me write a professional email' },
    { icon: 'message-circle', title: 'Just Chat', subtitle: 'Casual conversation', prompt: "What's the most interesting thing you know?" },
    { icon: 'book-open', title: 'Quick Summary', subtitle: 'Summarize anything', prompt: 'Summarize the latest in tech news' },
  ],
  mentor: [
    { icon: 'target', title: 'Set a Goal', subtitle: 'Define your next milestone', prompt: 'Help me set a meaningful career goal for this month' },
    { icon: 'route', title: 'Skill Roadmap', subtitle: 'Map your growth', prompt: 'Create a learning roadmap for becoming a better developer' },
    { icon: 'message-square', title: 'Mock Interview', subtitle: 'Practice makes perfect', prompt: 'Give me a tough interview question and coach me through it' },
    { icon: 'file-text', title: 'Review My Work', subtitle: 'Constructive feedback', prompt: 'I want feedback on my approach to problem solving' },
    { icon: 'trending-up', title: 'Career Advice', subtitle: 'Navigate your path', prompt: 'What skills are most valuable for career growth right now?' },
    { icon: 'graduation-cap', title: 'Study Plan', subtitle: 'Structured learning', prompt: 'Create a 30-day study plan for learning React' },
  ],
  translator: [
    { icon: 'languages', title: 'Quick Translate', subtitle: 'Any language pair', prompt: 'Translate "Good morning, how are you?" to Spanish' },
    { icon: 'repeat', title: 'Practice Session', subtitle: 'Bilingual drill', prompt: 'Give me 5 common phrases in French with translations' },
    { icon: 'book-open', title: 'Common Idioms', subtitle: 'Cultural expressions', prompt: 'What are some common idioms in Japanese?' },
    { icon: 'mic', title: 'Pronunciation', subtitle: 'Sound it out', prompt: 'How do you pronounce "thank you" in Mandarin?' },
    { icon: 'compass', title: 'Travel Phrases', subtitle: 'Essential vocabulary', prompt: 'Teach me essential travel phrases in Italian' },
    { icon: 'globe', title: 'Language Facts', subtitle: 'Linguistic trivia', prompt: 'What are the most spoken languages in the world?' },
  ],
  storyteller: [
    { icon: 'swords', title: 'Epic Adventure', subtitle: 'Begin a new quest', prompt: "Start an epic fantasy adventure where I'm the hero" },
    { icon: 'search', title: 'Mystery Tale', subtitle: 'Solve the puzzle', prompt: 'Tell me a short mystery story with a twist ending' },
    { icon: 'rocket', title: 'Sci-Fi World', subtitle: 'Explore the cosmos', prompt: 'Create a sci-fi story set on a distant planet' },
    { icon: 'heart', title: 'Love Story', subtitle: 'A romantic tale', prompt: 'Tell me a heartwarming love story' },
    { icon: 'skull', title: 'Spooky Story', subtitle: 'If you dare...', prompt: 'Tell me a creepy short horror story' },
    { icon: 'wand-sparkles', title: 'Fairy Tale', subtitle: 'Once upon a time...', prompt: 'Tell me a modern fairy tale with a twist' },
  ],
  coder: [
    { icon: 'bug', title: 'Debug Help', subtitle: 'Fix that pesky bug', prompt: 'Help me debug a common React useEffect issue' },
    { icon: 'puzzle', title: 'Design Pattern', subtitle: 'Clean architecture', prompt: 'Explain the Observer pattern with a practical example' },
    { icon: 'file-code-2', title: 'Write a Function', subtitle: 'Code on demand', prompt: 'Write a TypeScript function to debounce API calls' },
    { icon: 'git-branch', title: 'Code Review', subtitle: 'Improve your code', prompt: 'What are the top 5 code review best practices?' },
    { icon: 'layout', title: 'UI Component', subtitle: 'Build something', prompt: 'How do I build an accessible dropdown menu in React?' },
    { icon: 'database', title: 'SQL Help', subtitle: 'Query like a pro', prompt: 'Write an optimized SQL query for pagination' },
  ],
};

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Get 4 context-aware suggestions: 1 time-based + 3 mode-based.
 * Shuffled on each call for infinite rotation.
 */
export function getSuggestions(activeMode: VoxMode): Suggestion[] {
  const timeOfDay = getTimeOfDay();
  const timePick = shuffle(TIME_SUGGESTIONS[timeOfDay]).slice(0, 1);
  const modePicks = shuffle(MODE_SUGGESTIONS[activeMode]).slice(0, 3);
  return shuffle([...timePick, ...modePicks]);
}
