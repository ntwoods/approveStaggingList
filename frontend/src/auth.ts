const TOKEN_KEY = "ntw_id_token";
const EMAIL_KEY = "ntw_email";

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredEmail(): string | null {
  return sessionStorage.getItem(EMAIL_KEY);
}

export function setStoredEmail(email: string | null) {
  if (email) {
    sessionStorage.setItem(EMAIL_KEY, email);
  } else {
    sessionStorage.removeItem(EMAIL_KEY);
  }
}

export function clearStoredAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
}
