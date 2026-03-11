import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './Login';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  fetch: vi.fn(),
  redirectTo: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    login: mocks.login,
  }),
}));

vi.mock('@/lib/browser-navigation', () => ({
  redirectTo: mocks.redirectTo,
}));

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.login.mockReset();
    mocks.fetch.mockReset();
    mocks.redirectTo.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { needsSetup: false } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { available: true } }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { authorizationUrl: 'https://caia.example.gov/authorize' },
      }));
    global.fetch = mocks.fetch as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the browser CAIA/PIV login flow from the login screen', async () => {
    // critical-path: caia-login-browser
    // Risk mitigated: if the login page stops redirecting to CAIA, PIV users cannot begin federated sign-in from the browser.
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    );

    const pivButton = await screen.findByRole('button', { name: 'Sign in with PIV Card' });
    fireEvent.click(pivButton);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith('/api/auth/caia/login', {
        credentials: 'include',
      });
    });
    expect(mocks.redirectTo).toHaveBeenCalledWith('https://caia.example.gov/authorize');
  });
});
