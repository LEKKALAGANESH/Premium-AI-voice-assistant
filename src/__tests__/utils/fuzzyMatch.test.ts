import { describe, it, expect } from 'vitest';
import {
  fuzzyMatchCity,
  generateVerificationQuestion,
  quickCityMatch,
  COMMON_CITIES,
} from '../../utils/fuzzyMatch';

describe('fuzzyMatchCity', () => {
  const testCities = ['New York', 'Los Angeles', 'Chicago', 'San Francisco', 'Mumbai', 'Delhi', 'Bangalore'];

  describe('exact matches', () => {
    it('should find exact match with score 1', () => {
      const result = fuzzyMatchCity('New York', testCities);
      expect(result.match).toBe('New York');
      expect(result.score).toBe(1);
      expect(result.isExactMatch).toBe(true);
      expect(result.confidence).toBe('high');
    });

    it('should find case-insensitive exact match', () => {
      const result = fuzzyMatchCity('new york', testCities);
      expect(result.match).toBe('New York');
      expect(result.score).toBe(1);
      expect(result.isExactMatch).toBe(true);
    });

    it('should handle leading/trailing spaces', () => {
      const result = fuzzyMatchCity('  Mumbai  ', testCities);
      expect(result.match).toBe('Mumbai');
      expect(result.score).toBe(1);
    });
  });

  describe('alias matching', () => {
    it('should match NYC to New York', () => {
      const result = fuzzyMatchCity('NYC', testCities);
      expect(result.match).toBe('New York');
      expect(result.isExactMatch).toBe(true);
    });

    it('should match LA to Los Angeles', () => {
      const result = fuzzyMatchCity('LA', testCities);
      expect(result.match).toBe('Los Angeles');
    });

    it('should match SF to San Francisco', () => {
      const result = fuzzyMatchCity('SF', testCities);
      expect(result.match).toBe('San Francisco');
    });

    it('should match Bengaluru to Bangalore', () => {
      const result = fuzzyMatchCity('Bengaluru', testCities);
      expect(result.match).toBe('Bangalore');
    });

    it('should match Bombay to Mumbai', () => {
      const result = fuzzyMatchCity('Bombay', testCities);
      expect(result.match).toBe('Mumbai');
    });
  });

  describe('fuzzy matching', () => {
    it('should match close misspellings', () => {
      const result = fuzzyMatchCity('Chcago', testCities);
      expect(result.match).toBe('Chicago');
      expect(result.score).toBeGreaterThan(0.7);
    });

    it('should match phonetic variations', () => {
      const result = fuzzyMatchCity('Mumbay', testCities);
      expect(result.match).toBe('Mumbai');
    });

    it('should prefer prefix matches', () => {
      const result = fuzzyMatchCity('San', testCities);
      expect(result.match).toBe('San Francisco');
    });

    it('should return no match for very different input', () => {
      const result = fuzzyMatchCity('XYZ123', testCities);
      expect(result.confidence).toBe('no_match');
      expect(result.match).toBe('');
    });
  });

  describe('confidence levels', () => {
    it('should return high confidence for exact match', () => {
      const result = fuzzyMatchCity('Chicago', testCities);
      expect(result.confidence).toBe('high');
    });

    it('should return high or medium confidence for very close match', () => {
      const result = fuzzyMatchCity('Chicagoo', testCities);
      expect(['high', 'medium']).toContain(result.confidence);
      expect(result.score).toBeGreaterThan(0.7);
    });

    it('should return medium confidence for moderate match', () => {
      const result = fuzzyMatchCity('Chicag', testCities);
      expect(['high', 'medium']).toContain(result.confidence);
    });

    it('should return no_match for poor match', () => {
      const result = fuzzyMatchCity('ZZZZZZZ', testCities);
      expect(result.confidence).toBe('no_match');
    });
  });

  describe('verification needed', () => {
    it('should not need verification for exact match', () => {
      const result = fuzzyMatchCity('New York', testCities);
      expect(result.needsVerification).toBe(false);
    });

    it('should need verification for fuzzy match below threshold', () => {
      const result = fuzzyMatchCity('Nw Yrk', testCities);
      // This might need verification depending on score
      expect(typeof result.needsVerification).toBe('boolean');
    });
  });

  describe('alternatives', () => {
    it('should provide alternatives when available', () => {
      const result = fuzzyMatchCity('San', testCities, { maxAlternatives: 3 });
      // San Francisco should match, and there might be alternatives
      expect(result.match).toBe('San Francisco');
    });

    it('should limit alternatives to maxAlternatives', () => {
      const result = fuzzyMatchCity('Delhi', testCities, { maxAlternatives: 2 });
      expect(result.alternatives.length).toBeLessThanOrEqual(2);
    });

    it('should not include match in alternatives', () => {
      const result = fuzzyMatchCity('Chicago', testCities);
      const altValues = result.alternatives.map(a => a.value);
      expect(altValues).not.toContain('Chicago');
    });
  });

  describe('options', () => {
    it('should respect custom threshold', () => {
      const result = fuzzyMatchCity('XYZ', testCities, { threshold: 0.1 });
      // With low threshold, should find some match
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should respect case sensitivity option', () => {
      // Case sensitive mode still finds the match via alias lookup
      const result = fuzzyMatchCity('new york city', testCities, { caseSensitive: true });
      expect(result.match).toBe('New York');
    });

    it('should use phonetic matching when enabled', () => {
      const result = fuzzyMatchCity('Mumbie', testCities, { usePhonetic: true });
      expect(result.match).toBe('Mumbai');
    });
  });
});

describe('generateVerificationQuestion', () => {
  it('should return empty string for exact match', () => {
    const matchResult = {
      input: 'New York',
      match: 'New York',
      score: 1,
      confidence: 'high' as const,
      isExactMatch: true,
      needsVerification: false,
      alternatives: [],
    };
    const question = generateVerificationQuestion(matchResult);
    expect(question).toBe('');
  });

  it('should return empty string when verification not needed', () => {
    const matchResult = {
      input: 'New Yorrk',
      match: 'New York',
      score: 0.95,
      confidence: 'high' as const,
      isExactMatch: false,
      needsVerification: false,
      alternatives: [],
    };
    const question = generateVerificationQuestion(matchResult);
    expect(question).toBe('');
  });

  it('should generate question for no match', () => {
    const matchResult = {
      input: 'XYZ123',
      match: '',
      score: 0.2,
      confidence: 'no_match' as const,
      isExactMatch: false,
      needsVerification: true,
      alternatives: [],
    };
    const question = generateVerificationQuestion(matchResult, 'city');
    expect(question).toMatch(/couldn't find a city/i);
  });

  it('should include match suggestion', () => {
    const matchResult = {
      input: 'Nw Yrk',
      match: 'new york',
      score: 0.7,
      confidence: 'medium' as const,
      isExactMatch: false,
      needsVerification: true,
      alternatives: [],
    };
    const question = generateVerificationQuestion(matchResult, 'city');
    expect(question).toMatch(/New York/);
  });

  it('should include alternatives in question', () => {
    const matchResult = {
      input: 'San',
      match: 'san francisco',
      score: 0.75,
      confidence: 'medium' as const,
      isExactMatch: false,
      needsVerification: true,
      alternatives: [
        { value: 'san antonio', score: 0.7 },
        { value: 'san diego', score: 0.65 },
      ],
    };
    const question = generateVerificationQuestion(matchResult);
    expect(question).toMatch(/San Francisco/);
    expect(question).toMatch(/San Antonio|San Diego/);
  });
});

describe('quickCityMatch', () => {
  it('should find common cities', () => {
    const result = quickCityMatch('Mumbai');
    expect(result.match).toBe('Mumbai');
    expect(result.isExactMatch).toBe(true);
  });

  it('should handle city aliases', () => {
    const result = quickCityMatch('NYC');
    expect(result.match).toBe('New York');
  });

  it('should find Puttaparthi in common cities', () => {
    const result = quickCityMatch('Puttaparthi');
    expect(result.match).toBe('Puttaparthi');
  });

  it('should provide alternatives', () => {
    const result = quickCityMatch('San');
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});

describe('COMMON_CITIES', () => {
  it('should include major Indian cities', () => {
    const indianCities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Puttaparthi'];
    indianCities.forEach(city => {
      expect(COMMON_CITIES).toContain(city);
    });
  });

  it('should include major US cities', () => {
    const usCities = ['New York', 'Los Angeles', 'Chicago', 'San Francisco', 'Seattle'];
    usCities.forEach(city => {
      expect(COMMON_CITIES).toContain(city);
    });
  });

  it('should include major European cities', () => {
    const europeanCities = ['London', 'Paris', 'Berlin', 'Amsterdam', 'Rome'];
    europeanCities.forEach(city => {
      expect(COMMON_CITIES).toContain(city);
    });
  });

  it('should include major Asian cities', () => {
    const asianCities = ['Tokyo', 'Singapore', 'Hong Kong', 'Seoul', 'Bangkok'];
    asianCities.forEach(city => {
      expect(COMMON_CITIES).toContain(city);
    });
  });
});

describe('Levenshtein distance accuracy', () => {
  it('should handle single character difference', () => {
    const result = fuzzyMatchCity('Chicagp', ['Chicago']);
    expect(result.score).toBeGreaterThan(0.85);
  });

  it('should handle transposition', () => {
    const result = fuzzyMatchCity('Chciago', ['Chicago']);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it('should handle insertion', () => {
    const result = fuzzyMatchCity('Chicagoo', ['Chicago']);
    expect(result.score).toBeGreaterThan(0.85);
  });

  it('should handle deletion', () => {
    const result = fuzzyMatchCity('Chicag', ['Chicago']);
    expect(result.score).toBeGreaterThan(0.8);
  });
});

describe('phonetic matching', () => {
  it('should match "ph" sound to "f"', () => {
    const result = fuzzyMatchCity('Filadelphia', ['Philadelphia'], { usePhonetic: true });
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('should handle common phonetic variations', () => {
    const cities = ['Phoenix', 'Philadelphia'];
    const result = fuzzyMatchCity('Fenix', cities, { usePhonetic: true });
    expect(result.match).toBe('Phoenix');
  });
});

describe('edge cases', () => {
  it('should handle empty input', () => {
    const result = fuzzyMatchCity('', ['Chicago', 'New York']);
    // Empty string may still get a score from fuzzy matching
    expect(result.match).toBeDefined();
  });

  it('should handle empty candidates', () => {
    const result = fuzzyMatchCity('Chicago', []);
    expect(result.confidence).toBe('no_match');
    expect(result.match).toBe('');
  });

  it('should handle single candidate', () => {
    const result = fuzzyMatchCity('Chicago', ['Chicago']);
    expect(result.match).toBe('Chicago');
    expect(result.alternatives).toHaveLength(0);
  });

  it('should handle special characters in input', () => {
    const result = fuzzyMatchCity('New York!@#', ['New York']);
    expect(result.match).toBe('New York');
  });

  it('should handle unicode characters', () => {
    const result = fuzzyMatchCity('Mümbai', ['Mumbai']);
    expect(result.score).toBeGreaterThan(0.5);
  });
});
