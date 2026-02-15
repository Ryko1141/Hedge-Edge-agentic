import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  HelpCircle, 
  MessageCircle, 
  FileText, 
  Video, 
  ExternalLink, 
  ChevronDown,
  Keyboard,
  Rocket,
  Shield,
  Zap,
  BookOpen,
  Settings,
  BarChart3,
  Copy,
  Calculator,
  CheckCircle2,
} from 'lucide-react';
import { getKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

const helpResources = [
  {
    icon: Video,
    title: 'Video Tutorials',
    description: 'Watch step-by-step guides on how to use the platform',
    action: 'Watch Now',
    badge: 'New',
  },
  {
    icon: FileText,
    title: 'Documentation',
    description: 'Read detailed guides and API documentation',
    action: 'Read Docs',
  },
  {
    icon: MessageCircle,
    title: 'Contact Support',
    description: 'Get help from our support team within 24 hours',
    action: 'Contact Us',
  },
];

const quickStartSteps = [
  {
    icon: Settings,
    title: 'Activate License',
    description: 'Enter your license key in Settings to unlock all features',
  },
  {
    icon: BarChart3,
    title: 'Add Your Accounts',
    description: 'Connect your MT5 or cTrader trading accounts to track performance',
  },
  {
    icon: Copy,
    title: 'Set Up Trade Copier',
    description: 'Configure master and follower accounts for automatic trade copying',
  },
  {
    icon: Calculator,
    title: 'Use Risk Calculator',
    description: 'Calculate optimal position sizes based on your risk tolerance',
  },
];

const faqCategories = [
  {
    title: 'Getting Started',
    icon: Rocket,
    faqs: [
      {
        question: 'How do I add a new trading account?',
        answer: 'Click the "Add Account" button on the Overview page, select your account type (MT5, cTrader, or Manual), and fill in the required details. For MT5/cTrader, make sure your terminal is running locally.',
      },
      {
        question: 'What license key do I need?',
        answer: 'You need a valid Hedge Edge license key to unlock all features. Visit our website to purchase a license, then enter the key in Settings > License section.',
      },
      {
        question: 'How do I install the EA/cBot?',
        answer: 'Go to Settings and click "Open Installation Manager". This will guide you through installing the Expert Advisor (MT5) or cBot (cTrader) on your trading terminal. The installation is automatic and takes about 30 seconds.',
      },
    ],
  },
  {
    title: 'Connections & Security',
    icon: Shield,
    faqs: [
      {
        question: 'Can I connect my MT5 or cTrader account?',
        answer: 'Yes! We support both MT5 and cTrader platforms. The app connects directly to your local trading terminal for real-time data. Simply ensure your terminal is running and the EA/cBot is installed.',
      },
      {
        question: 'How does the local connection work?',
        answer: 'HedgeEdge uses secure IPC (Inter-Process Communication) via ZeroMQ to communicate with your local MT5/cTrader terminal. No VPS or cloud service required - your data stays on your computer and is never sent to external servers.',
      },
      {
        question: 'Is my data secure?',
        answer: 'Absolutely. All trading data flows directly between your local terminal and the app via encrypted IPC. Your broker credentials are stored in your OS keychain (Windows Credential Manager / macOS Keychain). We never have access to your login details.',
      },
      {
        question: 'Why is my connection showing as "Disconnected"?',
        answer: 'Check that: 1) Your MT5/cTrader terminal is running, 2) The Hedge Edge EA/cBot is attached to a chart, 3) AutoTrading is enabled in your terminal, 4) Your firewall isn\'t blocking local connections.',
      },
    ],
  },
  {
    title: 'Trade Copier',
    icon: Zap,
    faqs: [
      {
        question: 'How does the trade copier work?',
        answer: 'The trade copier monitors trades on your master account and automatically replicates them to follower accounts. You can configure lot multipliers, inverse copying (for hedging), and symbol mapping for each follower.',
      },
      {
        question: 'Can I copy trades between different brokers?',
        answer: 'Yes! As long as both terminals are running on your computer with the EA/cBot installed, you can copy trades between any MT5 or cTrader accounts, regardless of broker.',
      },
      {
        question: 'What is the latency for copied trades?',
        answer: 'Trade copying typically happens in under 50ms on local connections. The exact latency depends on your computer\'s performance and broker\'s execution speed.',
      },
    ],
  },
];

const Help = () => {
  const [openCategories, setOpenCategories] = useState<string[]>(['Getting Started']);
  const shortcuts = getKeyboardShortcuts();

  const toggleCategory = (title: string) => {
    setOpenCategories(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          Help & Support
          <BookOpen className="w-5 h-5 text-primary" />
          <Badge variant="secondary" className="text-xs">Beta</Badge>
        </h1>
        <p className="text-muted-foreground">Everything you need to master Hedge Edge</p>
      </div>

      {/* Quick Start Guide */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent animate-fade-in-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Rocket className="h-5 w-5 text-primary" />
            Quick Start Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickStartSteps.map((step, index) => (
              <div 
                key={step.title}
                className="flex items-start gap-3 p-3 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{index + 1}</span>
                </div>
                <div>
                  <h4 className="font-medium text-foreground text-sm">{step.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Help Resources */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
        {helpResources.map((resource) => (
          <Card 
            key={resource.title} 
            className="border-border/50 bg-card/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group"
          >
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <resource.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-foreground">{resource.title}</h3>
                  {resource.badge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {resource.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-4">{resource.description}</p>
                <Button variant="outline" size="sm" className="group-hover:border-primary/50">
                  {resource.action}
                  <ExternalLink className="ml-2 h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FAQ Sections */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <HelpCircle className="h-5 w-5" />
          Frequently Asked Questions
        </h2>
        
        {faqCategories.map((category) => (
          <Card key={category.title} className="border-border/50 bg-card/50 overflow-hidden">
            <Collapsible 
              open={openCategories.includes(category.title)}
              onOpenChange={() => toggleCategory(category.title)}
            >
              <CollapsibleTrigger className="w-full">
                <CardHeader className="hover:bg-muted/30 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <category.icon className="h-4 w-4 text-primary" />
                      {category.title}
                      <Badge variant="outline" className="text-[10px] ml-2">
                        {category.faqs.length} questions
                      </Badge>
                    </CardTitle>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                      openCategories.includes(category.title) ? 'rotate-180' : ''
                    }`} />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  {category.faqs.map((faq, index) => (
                    <div 
                      key={index} 
                      className="border-l-2 border-primary/30 pl-4 py-2 hover:border-primary/60 transition-colors"
                    >
                      <h4 className="font-medium text-foreground mb-1 flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        {faq.question}
                      </h4>
                      <p className="text-sm text-muted-foreground ml-6">{faq.answer}</p>
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {/* Keyboard Shortcuts */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shortcuts.map((shortcut) => (
              <div 
                key={shortcut.description}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, i) => (
                    <span key={i}>
                      <kbd className="px-2 py-1 text-xs font-mono bg-background border border-border rounded shadow-sm">
                        {key}
                      </kbd>
                      {i < shortcut.keys.length - 1 && <span className="mx-1 text-muted-foreground">+</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Help;
