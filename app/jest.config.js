module.exports = {
  preset: 'jest-expo',
  modulePaths: ['<rootDir>/node_modules'],
  // One React for app code and react-test-renderer (the hoisted root copy differs).
  moduleNameMapper: { '^react$': '<rootDir>/node_modules/react' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|native-base|react-native-svg)',
  ],
};
