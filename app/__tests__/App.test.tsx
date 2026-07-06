import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  it('renders the welcome text', async () => {
    const { getByText } = await render(<App />);
    expect(getByText('Open up App.tsx to start working on your app!')).toBeTruthy();
  });
});
