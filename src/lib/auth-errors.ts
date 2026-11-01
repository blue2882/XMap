import type { AuthError } from '@supabase/supabase-js';

export const formatAuthError = (error: AuthError): string => {
  const message = error.message.toLowerCase();
  const code = error.code?.toLowerCase();

  if (
    code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('user already exists')
  ) {
    return 'An account with this email already exists. Sign in or use Forgot password.';
  }
  if (message.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (message.includes('email not confirmed')) {
    return 'Confirm your email first, then sign in.';
  }
  return error.message;
};
