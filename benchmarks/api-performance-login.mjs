import fs from 'fs';

const baseUrl = process.env.SHIP_BASE_URL || 'http://localhost:3000';
const email = process.env.SHIP_EMAIL || 'dev@ship.local';
const password = process.env.SHIP_PASSWORD || 'admin123';
const cookiePath = process.env.SHIP_COOKIE_PATH || '/tmp/ship.cookies';

function extractCookieMap(setCookieHeaders) {
  const cookieMap = new Map();

  for (const header of setCookieHeaders) {
    const [pair] = header.split(';');
    if (!pair) continue;

    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) continue;

    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!name || !value) continue;

    cookieMap.set(name, value);
  }

  return cookieMap;
}

async function main() {
  const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`);
  if (!csrfResponse.ok) {
    throw new Error(`Failed to fetch CSRF token: ${csrfResponse.status}`);
  }

  const csrfBody = await csrfResponse.json();
  const csrfToken = csrfBody.token;
  const cookieMap = extractCookieMap(csrfResponse.headers.getSetCookie());

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      cookie: Array.from(cookieMap.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; '),
    },
    body: JSON.stringify({ email, password }),
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text();
    throw new Error(`Login failed: ${loginResponse.status} ${errorText}`);
  }

  for (const [name, value] of extractCookieMap(loginResponse.headers.getSetCookie()).entries()) {
    cookieMap.set(name, value);
  }

  const cookieHeader = Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  fs.writeFileSync(cookiePath, cookieHeader);
  console.log(JSON.stringify({ cookiePath, cookieHeader }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
