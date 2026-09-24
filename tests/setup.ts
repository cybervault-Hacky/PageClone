import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetTabsQuery } from './chromeMock';

beforeEach(() => {
  resetTabsQuery();
});
