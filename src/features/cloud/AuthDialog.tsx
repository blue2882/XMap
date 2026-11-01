import { useState } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatAuthError } from '@/lib/auth-errors';
import { notify } from '@/lib/notify';
import {
  getAuthRedirectUrl,
  isSupabaseConfigured,
  supabase,
  supabaseConfigMessage,
  supabaseDeployConfigMessage,
} from '@/lib/supabase';

const MIN_PASSWORD_LENGTH = 6;

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type AuthResult = { error: AuthError | null };

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  const run = async (action: () => Promise<AuthResult>, success: string) => {
    setPending(true);
    try {
      const { error } = await action();
      if (error) {
        notify.error('Sign-in failed', formatAuthError(error));
        return;
      }
      notify.success(success);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      notify.error('Sign-in failed', message);
    } finally {
      setPending(false);
    }
  };

  const submitSignIn = (event: { preventDefault(): void }) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || password.length < MIN_PASSWORD_LENGTH) {
      notify.error('Enter an email and a password of at least 6 characters');
      return;
    }
    void run(
      () => supabase.auth.signInWithPassword({ email: trimmed, password }),
      'Signed in. Your library saves to your account.',
    );
  };

  const submitSignUp = (event: { preventDefault(): void }) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || password.length < MIN_PASSWORD_LENGTH) {
      notify.error('Enter an email and a password of at least 6 characters');
      return;
    }
    setPending(true);
    void (async () => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: trimmed,
          password,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
        if (error) {
          notify.error('Could not create account', formatAuthError(error));
          return;
        }
        if (data.session) {
          notify.success('Signed in. Your library saves to your account.');
          onOpenChange(false);
          return;
        }
        notify.success(
          'Confirm your email',
          'We sent a confirmation link. After you confirm, sign in with your password.',
        );
        onOpenChange(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error';
        notify.error('Could not create account', message);
      } finally {
        setPending(false);
      }
    })();
  };

  const resetPassword = () => {
    const trimmed = email.trim();
    if (!trimmed) {
      notify.error('Enter your email', 'Use the email field above, then try Forgot password again.');
      return;
    }
    void run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: getAuthRedirectUrl(),
      });
      return { error };
    }, 'Password reset email sent. Check your inbox.');
  };

  const continueWithGoogle = () => {
    setPending(true);
    void (async () => {
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: getAuthRedirectUrl() },
        });
        if (error) {
          notify.error('Sign-in failed', formatAuthError(error));
          setPending(false);
          return;
        }
        if (data.url) {
          window.location.assign(data.url);
          return;
        }
        notify.error('Sign-in failed', 'Google sign-in did not return a redirect URL.');
        setPending(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error';
        notify.error('Sign-in failed', message);
        setPending(false);
      }
    })();
  };

  if (!isSupabaseConfigured) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cloud sign-in unavailable</DialogTitle>
            <DialogDescription>
              {import.meta.env.PROD
                ? supabaseDeployConfigMessage
                : `This build has no Supabase project configured. ${supabaseConfigMessage}`}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
          <DialogDescription>
            Maps and folders are stored in your Supabase account. This device keeps a copy so editing stays fast.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={submitSignIn}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="auth-password">Password</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-0 px-2 text-xs text-muted"
                disabled={pending}
                onClick={resetPassword}
              >
                Forgot password?
              </Button>
            </div>
            <Input
              id="auth-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              Sign in
            </Button>
            <Button type="button" disabled={pending} onClick={submitSignUp}>
              Create account
            </Button>
          </div>
        </form>
        <Button type="button" disabled={pending} onClick={continueWithGoogle}>
          Continue with Google
        </Button>
      </DialogContent>
    </Dialog>
  );
}
