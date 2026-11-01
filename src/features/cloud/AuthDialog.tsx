import { useState } from 'react';
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
import { notify } from '@/lib/notify';
import { supabase } from '@/lib/supabase';

const MIN_PASSWORD_LENGTH = 6;

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  const run = async (action: () => Promise<{ error: { message: string } | null }>, success: string) => {
    setPending(true);
    const { error } = await action();
    setPending(false);
    if (error) {
      notify.error('Sign-in failed', error.message);
      return;
    }
    notify.success(success);
    onOpenChange(false);
  };

  const submit = (event: { preventDefault(): void }, mode: 'in' | 'up') => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || password.length < MIN_PASSWORD_LENGTH) {
      notify.error('Enter an email and a password of at least 6 characters');
      return;
    }
    const credentials = { email: trimmed, password };
    if (mode === 'up') {
      void run(
        () =>
          supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: window.location.origin },
          }),
        'Account created. Check your email if confirmation is on.',
      );
      return;
    }
    void run(() => supabase.auth.signInWithPassword(credentials), 'Signed in. Your library saves to your account.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
          <DialogDescription>
            Maps and folders are stored in your Supabase account. This device keeps a copy so editing stays fast.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(event) => submit(event, 'in')}>
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
            <Label htmlFor="auth-password">Password</Label>
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
            <Button type="button" disabled={pending} onClick={(event) => submit(event, 'up')}>
              Create account
            </Button>
          </div>
        </form>
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            void run(
              () =>
                supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: { redirectTo: window.location.origin },
                }),
              'Continuing with Google',
            );
          }}
        >
          Continue with Google
        </Button>
      </DialogContent>
    </Dialog>
  );
}
