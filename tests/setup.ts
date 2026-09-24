import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetChromeMocks } from './chromeMock';

beforeEach(() => {
  resetChromeMocks();
});
