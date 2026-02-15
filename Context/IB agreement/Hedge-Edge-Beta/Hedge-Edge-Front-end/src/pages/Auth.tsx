import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, TrendingUp, Sparkles, AlertTriangle } from 'lucide-react';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { 
  emailSchema, 
  passwordSchema,
  sanitizeInput,
  isAccountLocked,
  getRemainingLockoutTime 
} from '@/lib/security';

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null);

  // Check for session timeout redirect
  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'idle') {
      toast({
        title: 'Session Expired ⏰',
        description: 'Your session timed out due to inactivity. Please sign in again.',
        variant: 'destructive',
      });
    }
  }, [searchParams, toast]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/app/overview');
    }
  }, [user, navigate]);

  // Check for account lockout when email changes
  useEffect(() => {
    if (email && isAccountLocked(email)) {
      const remaining = getRemainingLockoutTime(email);
      const minutes = Math.ceil(remaining / 60000);
      setLockoutMessage(`Account temporarily locked. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`);
    } else {
      setLockoutMessage(null);
    }
  }, [email]);

  if (user) {
    return null;
  }

  const validateSignInInputs = () => {
    // Validate email
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      toast({
        title: 'Validation Error ⚠️',
        description: emailResult.error.errors[0].message,
        variant: 'destructive',
      });
      return false;
    }

    // For sign in, just check password is not empty
    if (!password || password.length < 1) {
      toast({
        title: 'Validation Error ⚠️',
        description: 'Password is required',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const validateSignUpInputs = () => {
    // Validate email
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      toast({
        title: 'Validation Error ⚠️',
        description: emailResult.error.errors[0].message,
        variant: 'destructive',
      });
      return false;
    }

    // Validate password with strong requirements for sign up
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      toast({
        title: 'Weak Password ⚠️',
        description: passwordResult.error.errors[0].message,
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for lockout before proceeding
    if (isAccountLocked(email)) {
      const remaining = getRemainingLockoutTime(email);
      const minutes = Math.ceil(remaining / 60000);
      toast({
        title: 'Account Locked 🔒',
        description: `Too many failed attempts. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        variant: 'destructive',
      });
      return;
    }

    if (!validateSignInInputs()) return;
    
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      toast({
        title: 'Sign in failed ❌',
        description: error.message,
        variant: 'destructive',
      });
      
      // Update lockout message if account is now locked
      if (isAccountLocked(email)) {
        const remaining = getRemainingLockoutTime(email);
        const minutes = Math.ceil(remaining / 60000);
        setLockoutMessage(`Account temporarily locked. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`);
      }
    } else {
      navigate('/app/overview');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignUpInputs()) return;

    setLoading(true);
    // Sanitize the full name before sending
    const sanitizedName = fullName ? sanitizeInput(fullName) : undefined;
    const { error } = await signUp(email, password, sanitizedName);
    setLoading(false);

    if (error) {
      let description = error.message;
      if (error.message.includes('already registered')) {
        description = 'This email is already registered. Please sign in instead.';
      }
      toast({
        title: 'Sign up failed ❌',
        description,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Account created! 🎉',
        description: 'You have been logged in successfully.',
      });
      navigate('/app/overview');
    }
  };

  return (
    <AnimatedBackground className="flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Logo */}
        <div className="flex items-center justify-center gap-1 mb-8">
          <TrendingUp className="w-10 h-10 text-primary" strokeWidth={3} />
          <span className="text-3xl font-bold text-primary">HedgeEdge</span>
        </div>

        <Card className="border-border/30 bg-card/60 backdrop-blur-xl shadow-2xl shadow-primary/5">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              Welcome back
              <Sparkles className="w-5 h-5 text-secondary animate-pulse" />
            </CardTitle>
            <CardDescription className="text-base">
              Sign in to manage your trading accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted/50 backdrop-blur-sm">
                <TabsTrigger 
                  value="signin" 
                  className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300"
                >
                  Sign In
                </TabsTrigger>
                <TabsTrigger 
                  value="signup"
                  className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300"
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="animate-fade-in-up">
                <form onSubmit={handleSignIn} className="space-y-4">
                  {lockoutMessage && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <span>{lockoutMessage}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="text-foreground">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="text-foreground">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      autoComplete="current-password"
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="animate-fade-in-up">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-foreground">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-foreground">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-foreground">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer text */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </AnimatedBackground>
  );
};

export default Auth;