import { useState, useMemo } from 'react';
import { useTradingAccounts, TradingAccount } from '@/hooks/useTradingAccounts';
import { HedgeAccountCard } from '@/components/dashboard/HedgeAccountCard';
import { LinkedAccountCard } from '@/components/dashboard/LinkedAccountCard';
import { AddAccountModal } from '@/components/dashboard/AddAccountModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { 
  Plus, 
  Search, 
  Zap, 
  Link2,
  AlertCircle
} from 'lucide-react';

// Local storage keys
const RELATIONSHIPS_KEY = 'hedge_edge_relationships';

interface AccountLink {
  linkedAccountId: string;
  hedgeAccountId: string;
}

const getStoredLinks = (): AccountLink[] => {
  try {
    const stored = localStorage.getItem(RELATIONSHIPS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveLinks = (links: AccountLink[]) => {
  localStorage.setItem(RELATIONSHIPS_KEY, JSON.stringify(links));
};

type FilterType = 'all' | 'hedge' | 'linked';

const Accounts = () => {
  const { accounts, loading, createAccount, deleteAccount } = useTradingAccounts();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalType, setAddModalType] = useState<'hedge' | 'linked'>('hedge');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('hedge');
  const [links, setLinks] = useState<AccountLink[]>(getStoredLinks);
  const { toast } = useToast();

  // Separate accounts by type
  const hedgeAccounts = useMemo(() => 
    accounts.filter(a => a.phase === 'live'), 
    [accounts]
  );
  
  const linkedAccounts = useMemo(() => 
    accounts.filter(a => a.phase !== 'live'),
    [accounts]
  );

  // Filter accounts based on search
  const filteredHedgeAccounts = useMemo(() => 
    hedgeAccounts.filter(a => 
      a.account_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.platform?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.server?.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [hedgeAccounts, searchQuery]
  );

  const filteredLinkedAccounts = useMemo(() => 
    linkedAccounts.filter(a => 
      a.account_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.prop_firm?.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [linkedAccounts, searchQuery]
  );

  // Get linked hedge ID for an account
  const getLinkedHedgeId = (accountId: string): string | null => {
    const link = links.find(l => l.linkedAccountId === accountId);
    return link?.hedgeAccountId || null;
  };

  // Count linked accounts for a hedge
  const getLinkedCount = (hedgeId: string): number => {
    return links.filter(l => l.hedgeAccountId === hedgeId).length;
  };

  // Handle link change
  const handleLinkChange = (linkedAccountId: string, hedgeAccountId: string | null) => {
    let updated: AccountLink[];
    
    if (hedgeAccountId) {
      // Remove existing link for this account, add new one
      updated = links.filter(l => l.linkedAccountId !== linkedAccountId);
      updated.push({ linkedAccountId, hedgeAccountId });
      toast({
        title: 'Account linked 🔗',
        description: 'Hedge relationship updated.',
      });
    } else {
      // Remove link
      updated = links.filter(l => l.linkedAccountId !== linkedAccountId);
      toast({
        title: 'Link removed 🗑️',
        description: 'Account unlinked.',
      });
    }
    
    setLinks(updated);
    saveLinks(updated);
  };

  // Handle add account
  const handleAddHedge = () => {
    setAddModalType('hedge');
    setAddModalOpen(true);
  };

  const handleAddLinked = () => {
    if (hedgeAccounts.length === 0) {
      toast({
        title: 'Add a hedge account first ⚠️',
        description: 'You need at least one hedge account to link others.',
        variant: 'destructive',
      });
      return;
    }
    setAddModalType('linked');
    setAddModalOpen(true);
  };

  // Handle delete with link cleanup
  const handleDeleteAccount = async (id: string) => {
    // Remove any links involving this account
    const updated = links.filter(l => l.linkedAccountId !== id && l.hedgeAccountId !== id);
    setLinks(updated);
    saveLinks(updated);
    await deleteAccount(id);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading accounts...</p>
        </div>
      </div>
    );
  }

  const showHedgeSection = filter === 'all' || filter === 'hedge';
  const showLinkedSection = filter === 'all' || filter === 'linked';

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
            <p className="text-muted-foreground">Manage your hedge and linked trading accounts</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleAddHedge} className="gap-2">
              <Zap className="h-4 w-4" />
              Add Hedge Account
            </Button>
            <Button 
              onClick={handleAddLinked} 
              variant="outline" 
              className="gap-2"
              disabled={hedgeAccounts.length === 0}
            >
              <Link2 className="h-4 w-4" />
              Add Linked Account
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/30 border-border/50"
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border border-border/30">
            {(['all', 'hedge', 'linked'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                  filter === f 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f === 'all' ? 'All' : f === 'hedge' ? 'Hedge' : 'Linked'}
              </button>
            ))}
          </div>
        </div>

        {/* Empty State - No Hedge Accounts */}
        {hedgeAccounts.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-blue-500/30 bg-blue-500/5 p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Add a hedge account to start</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Hedge accounts are the core of your setup. Add one first to start linking your evaluation and funded accounts.
            </p>
            <Button onClick={handleAddHedge} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Hedge Account
            </Button>
          </div>
        )}

        {/* Hedge Accounts Section */}
        {hedgeAccounts.length > 0 && showHedgeSection && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-foreground">Hedge Accounts</h2>
              <span className="text-sm text-muted-foreground">({hedgeAccounts.length})</span>
            </div>
            
            {filteredHedgeAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No hedge accounts match your search.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredHedgeAccounts.map((account) => (
                  <HedgeAccountCard
                    key={account.id}
                    account={account}
                    linkedCount={getLinkedCount(account.id)}
                    onManageLinks={() => {
                      // Could open a modal to manage links
                      setFilter('linked');
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Linked Accounts Section */}
        {hedgeAccounts.length > 0 && showLinkedSection && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Linked Accounts</h2>
                <span className="text-sm text-muted-foreground">({linkedAccounts.length})</span>
              </div>
            </div>
            
            {linkedAccounts.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <Link2 className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Link your trading accounts</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                  Add your evaluation and funded accounts to link them with your hedge accounts.
                </p>
                <Button onClick={handleAddLinked} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Linked Account
                </Button>
              </div>
            ) : filteredLinkedAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No linked accounts match your search.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLinkedAccounts.map((account) => (
                  <LinkedAccountCard
                    key={account.id}
                    account={account}
                    hedgeAccounts={hedgeAccounts}
                    linkedHedgeId={getLinkedHedgeId(account.id)}
                    onLinkChange={(hedgeId) => handleLinkChange(account.id, hedgeId)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <AddAccountModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSubmit={createAccount}
        defaultType={addModalType}
        hedgeAccounts={hedgeAccounts}
        existingAccounts={accounts}
      />
    </div>
  );
};

export default Accounts;
