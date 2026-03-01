import { describe, it, expect } from 'vitest';
import {
  sanitizeTranscript,
  isConfidenceBelowThreshold,
  generateClarificationMessage,
  extractConfidenceFromTranscript,
  sanitizeTranscripts,
} from '../../utils/sanitizeTranscript';

describe('sanitizeTranscript', () => {
  describe('basic sanitization', () => {
    it('should return the original text when no artifacts present', () => {
      const result = sanitizeTranscript('hello world', 0.95);
      expect(result.sanitized).toBe('hello world');
      expect(result.original).toBe('hello world');
    });

    it('should remove confidence suffixes', () => {
      const result = sanitizeTranscript('hello world 86%', 0.86);
      expect(result.sanitized).toBe('hello world');
      expect(result.artifacts).toContain('86%');
    });

    it('should remove inline confidence markers', () => {
      const result = sanitizeTranscript('hello [89%] world', 0.89);
      expect(result.sanitized).toBe('hello world');
      expect(result.artifacts).toContain('[89%]');
    });

    it('should remove parenthetical confidence markers', () => {
      const result = sanitizeTranscript('weather (92%)', 0.92);
      expect(result.sanitized).toBe('weather');
    });

    it('should handle empty string', () => {
      const result = sanitizeTranscript('', 1.0);
      expect(result.sanitized).toBe('');
    });
  });

  describe('noise markers', () => {
    it('should remove [inaudible] markers', () => {
      const result = sanitizeTranscript('hello [inaudible] world', 0.8);
      expect(result.sanitized).toBe('hello world');
    });

    it('should remove [unclear] markers', () => {
      const result = sanitizeTranscript('the [unclear] is here', 0.8);
      expect(result.sanitized).toBe('the is here');
    });

    it('should remove <noise> markers', () => {
      const result = sanitizeTranscript('hello <noise> there', 0.8);
      expect(result.sanitized).toBe('hello there');
    });

    it('should remove multiple noise markers', () => {
      const result = sanitizeTranscript('[inaudible] hello [noise] world [unclear]', 0.8);
      expect(result.sanitized).toBe('hello world');
    });
  });

  describe('filler words', () => {
    it('should remove "um" filler word', () => {
      const result = sanitizeTranscript('um hello um world', 0.9, { removeFiller: true });
      expect(result.sanitized).toBe('hello world');
    });

    it('should remove "uh" filler word', () => {
      const result = sanitizeTranscript('uh what is uh the weather', 0.9);
      expect(result.sanitized).toBe('what is the weather');
    });

    it('should remove "like" as filler', () => {
      const result = sanitizeTranscript('I like want like to go', 0.9);
      expect(result.sanitized).toBe('I want to go');
    });

    it('should remove "you know" filler', () => {
      const result = sanitizeTranscript('you know the thing you know', 0.9);
      expect(result.sanitized).toBe('the thing');
    });

    it('should preserve filler words when disabled', () => {
      const result = sanitizeTranscript('um hello um', 0.9, { removeFiller: false });
      expect(result.sanitized).toBe('um hello um');
    });
  });

  describe('repeated words', () => {
    it('should remove consecutive repeated words', () => {
      const result = sanitizeTranscript('the the cat', 0.9, { removeRepeats: true });
      expect(result.sanitized).toBe('the cat');
    });

    it('should handle triple repeats', () => {
      const result = sanitizeTranscript('I I I want to', 0.9);
      expect(result.sanitized).toBe('I want to');
    });

    it('should preserve repeated words when disabled', () => {
      const result = sanitizeTranscript('the the cat', 0.9, { removeRepeats: false });
      expect(result.sanitized).toBe('the the cat');
    });
  });

  describe('trailing artifacts', () => {
    it('should remove trailing ellipsis', () => {
      const result = sanitizeTranscript('hello world...', 0.9);
      expect(result.sanitized).toBe('hello world');
    });

    it('should remove trailing question marks', () => {
      const result = sanitizeTranscript('what is this???', 0.9);
      expect(result.sanitized).toBe('what is this');
    });

    it('should remove trailing exclamation marks', () => {
      const result = sanitizeTranscript('wow!!!', 0.9);
      expect(result.sanitized).toBe('wow');
    });
  });

  describe('common corrections', () => {
    it('should correct "wheather" to "weather"', () => {
      const result = sanitizeTranscript('wheather forecast', 0.9);
      expect(result.sanitized).toBe('weather forecast');
    });

    it('should correct "temprature" to "temperature"', () => {
      const result = sanitizeTranscript('temprature today', 0.9);
      expect(result.sanitized).toBe('temperature today');
    });

    it('should correct "tommorow" to "tomorrow"', () => {
      const result = sanitizeTranscript('tommorow weather', 0.9);
      expect(result.sanitized).toBe('tomorrow weather');
    });

    it('should correct "celcius" to "celsius"', () => {
      const result = sanitizeTranscript('20 celcius', 0.9);
      expect(result.sanitized).toBe('20 celsius');
    });
  });

  describe('whitespace normalization', () => {
    it('should normalize multiple spaces', () => {
      const result = sanitizeTranscript('hello    world', 0.9);
      expect(result.sanitized).toBe('hello world');
    });

    it('should trim leading and trailing whitespace', () => {
      const result = sanitizeTranscript('  hello world  ', 0.9);
      expect(result.sanitized).toBe('hello world');
    });

    it('should preserve whitespace when disabled', () => {
      const result = sanitizeTranscript('  hello  ', 0.9, { normalizeWhitespace: false });
      expect(result.sanitized).toBe('  hello  ');
    });
  });

  describe('lowercase output', () => {
    it('should convert to lowercase when enabled', () => {
      const result = sanitizeTranscript('Hello WORLD', 0.9, { lowercaseOutput: true });
      expect(result.sanitized).toBe('hello world');
    });

    it('should preserve case when disabled', () => {
      const result = sanitizeTranscript('Hello WORLD', 0.9, { lowercaseOutput: false });
      expect(result.sanitized).toBe('Hello WORLD');
    });
  });

  describe('confidence tracking', () => {
    it('should mark low confidence correctly', () => {
      const result = sanitizeTranscript('test', 0.5);
      expect(result.isLowConfidence).toBe(true);
    });

    it('should mark high confidence correctly', () => {
      const result = sanitizeTranscript('test', 0.95);
      expect(result.isLowConfidence).toBe(false);
    });

    it('should use custom threshold', () => {
      const result = sanitizeTranscript('test', 0.85, { confidenceThreshold: 0.9 });
      expect(result.isLowConfidence).toBe(true);
    });
  });

  describe('corrections tracking', () => {
    it('should track confidence suffix corrections', () => {
      const result = sanitizeTranscript('hello 86%', 0.86);
      expect(result.corrections).toHaveLength(1);
      expect(result.corrections[0].type).toBe('confidence_suffix');
    });

    it('should track filler word corrections', () => {
      const result = sanitizeTranscript('um hello', 0.9);
      const fillerCorrections = result.corrections.filter(c => c.type === 'filler_word');
      expect(fillerCorrections.length).toBeGreaterThan(0);
    });
  });

  describe('combined sanitization', () => {
    it('should handle multiple artifacts at once', () => {
      const result = sanitizeTranscript('um [inaudible] hello world... 86%', 0.86);
      expect(result.sanitized).toBe('hello world');
    });

    it('should handle complex real-world transcript', () => {
      const result = sanitizeTranscript(
        'um so like [unclear] the the wheather tommorow 92%',
        0.92
      );
      expect(result.sanitized).toBe('the weather tomorrow');
    });
  });
});

describe('isConfidenceBelowThreshold', () => {
  it('should return true when below default threshold', () => {
    expect(isConfidenceBelowThreshold(0.7)).toBe(true);
  });

  it('should return false when above default threshold', () => {
    expect(isConfidenceBelowThreshold(0.9)).toBe(false);
  });

  it('should use custom threshold', () => {
    expect(isConfidenceBelowThreshold(0.85, 0.9)).toBe(true);
    expect(isConfidenceBelowThreshold(0.85, 0.8)).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isConfidenceBelowThreshold(0.8, 0.8)).toBe(false);
    expect(isConfidenceBelowThreshold(0.79, 0.8)).toBe(true);
  });
});

describe('generateClarificationMessage', () => {
  it('should generate city-specific clarification', () => {
    const message = generateClarificationMessage('city');
    expect(message).toMatch(/city|didn't catch/i);
  });

  it('should generate general clarification', () => {
    const message = generateClarificationMessage('general');
    expect(message).toMatch(/catch|repeat|understood|say/i);
  });

  it('should generate name-specific clarification', () => {
    const message = generateClarificationMessage('name');
    expect(message).toMatch(/name|repeat/i);
  });

  it('should generate number-specific clarification', () => {
    const message = generateClarificationMessage('number');
    expect(message).toMatch(/number|repeat/i);
  });
});

describe('extractConfidenceFromTranscript', () => {
  it('should extract suffix confidence', () => {
    const result = extractConfidenceFromTranscript('hello world 86%');
    expect(result.text).toBe('hello world');
    expect(result.extractedConfidence).toBe(0.86);
  });

  it('should extract inline confidence with brackets', () => {
    const result = extractConfidenceFromTranscript('hello [89%] world');
    expect(result.text).toBe('hello world');
    expect(result.extractedConfidence).toBe(0.89);
  });

  it('should extract inline confidence with parentheses', () => {
    const result = extractConfidenceFromTranscript('weather (92%)');
    expect(result.text).toBe('weather');
    expect(result.extractedConfidence).toBe(0.92);
  });

  it('should return null when no confidence found', () => {
    const result = extractConfidenceFromTranscript('hello world');
    expect(result.text).toBe('hello world');
    expect(result.extractedConfidence).toBeNull();
  });

  it('should handle 100% confidence', () => {
    const result = extractConfidenceFromTranscript('perfect 100%');
    expect(result.extractedConfidence).toBe(1);
  });
});

describe('sanitizeTranscripts', () => {
  it('should sanitize multiple transcripts', () => {
    const inputs = [
      { text: 'hello 86%', confidence: 0.86 },
      { text: 'world 92%', confidence: 0.92 },
    ];
    const results = sanitizeTranscripts(inputs);

    expect(results).toHaveLength(2);
    expect(results[0].sanitized).toBe('hello');
    expect(results[1].sanitized).toBe('world');
  });

  it('should apply options to all transcripts', () => {
    const inputs = [
      { text: 'HELLO', confidence: 0.9 },
      { text: 'WORLD', confidence: 0.9 },
    ];
    const results = sanitizeTranscripts(inputs, { lowercaseOutput: true });

    expect(results[0].sanitized).toBe('hello');
    expect(results[1].sanitized).toBe('world');
  });

  it('should handle empty array', () => {
    const results = sanitizeTranscripts([]);
    expect(results).toEqual([]);
  });
});
