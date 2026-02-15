import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TradingAccount } from '@/hooks/useTradingAccounts';
import { HedgeNode } from './HedgeNode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Link2, 
  Plus,
  Trash2,
  ArrowRight
} from 'lucide-react';

// Hedge relationship type
export interface HedgeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  offsetPercentage: number; // How much of source is offset by target
  logic: 'mirror' | 'partial' | 'inverse';
  isActive: boolean;
}

interface HedgeMapProps {
  accounts: TradingAccount[];
  relationships?: HedgeRelationship[];
  onAddAccount: () => void;
  onDeleteAccount: (id: string) => void;
  onCreateRelationship?: (sourceId: string, targetId: string) => void;
  onDeleteRelationship?: (id: string) => void;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
}

export const HedgeMap = ({ 
  accounts, 
  relationships = [],
  onAddAccount, 
  onDeleteAccount,
  onCreateRelationship,
  onDeleteRelationship 
}: HedgeMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Track container size changes
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    
    // Use ResizeObserver for more accurate tracking
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSize);
      resizeObserver.disconnect();
    };
  }, []);

  // Calculate positions relative to center (0,0) - container will handle centering
  useEffect(() => {
    if (accounts.length === 0) return;
    
    // Group accounts by type
    const propAccounts = accounts.filter(a => a.phase === 'evaluation');
    const fundedAccounts = accounts.filter(a => a.phase === 'funded');
    const hedgeAccounts = accounts.filter(a => a.phase === 'live');
    
    const positions: NodePosition[] = [];
    const nodeWidth = 288;
    const nodeHeight = 280;
    const horizontalGap = 120;
    const verticalGap = 40;
    
    // Position everything relative to center (0, 0)
    // The container transform will handle actual centering
    
    // Position Hedge accounts in the center column
    hedgeAccounts.forEach((account, index) => {
      const totalHeight = hedgeAccounts.length * nodeHeight + (hedgeAccounts.length - 1) * verticalGap;
      const startY = -totalHeight / 2 + nodeHeight / 2;
      positions.push({
        id: account.id,
        x: 0,
        y: startY + index * (nodeHeight + verticalGap),
      });
    });
    
    // Position Prop/Evaluation accounts on the left
    propAccounts.forEach((account, index) => {
      const totalHeight = propAccounts.length * nodeHeight + (propAccounts.length - 1) * verticalGap;
      const startY = -totalHeight / 2 + nodeHeight / 2;
      positions.push({
        id: account.id,
        x: -(nodeWidth + horizontalGap),
        y: startY + index * (nodeHeight + verticalGap),
      });
    });
    
    // Position Funded accounts on the right
    fundedAccounts.forEach((account, index) => {
      const totalHeight = fundedAccounts.length * nodeHeight + (fundedAccounts.length - 1) * verticalGap;
      const startY = -totalHeight / 2 + nodeHeight / 2;
      positions.push({
        id: account.id,
        x: nodeWidth + horizontalGap,
        y: startY + index * (nodeHeight + verticalGap),
      });
    });

    setNodePositions(positions);
  }, [accounts]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('map-canvas')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  // Use ref for real-time pan updates to avoid React re-renders during drag
  const panRef = useRef(pan);
  const transformRef = useRef<HTMLDivElement>(null);
  const svgTransformRef = useRef<SVGSVGElement>(null);

  const updateTransform = useCallback(() => {
    const transform = `translate(${containerSize.width / 2 + panRef.current.x}px, ${containerSize.height / 2 + panRef.current.y}px) scale(${zoom})`;
    if (transformRef.current) {
      transformRef.current.style.transform = transform;
    }
    if (svgTransformRef.current) {
      svgTransformRef.current.style.transform = transform;
    }
  }, [containerSize.width, containerSize.height, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      panRef.current = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      };
      // Update transform directly via ref - no React re-render
      updateTransform();
    }
  }, [isDragging, dragStart, updateTransform]);

  const handleMouseUp = () => {
    setIsDragging(false);
    // Sync ref value back to state when drag ends
    setPan(panRef.current);
  };

  // Keep panRef in sync when pan state changes
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // Update transform when zoom or container size changes
  useEffect(() => {
    updateTransform();
  }, [zoom, containerSize, updateTransform]);

  // Zoom handlers
  const handleZoomIn = () => setZoom(z => Math.min(z + 0.15, 2));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.15, 0));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    panRef.current = { x: 0, y: 0 };
  };

  // Node interaction handlers
  const handleNodeClick = (accountId: string) => {
    if (isLinking && linkSource) {
      if (linkSource !== accountId && onCreateRelationship) {
        onCreateRelationship(linkSource, accountId);
      }
      setIsLinking(false);
      setLinkSource(null);
    } else {
      setSelectedNode(accountId === selectedNode ? null : accountId);
    }
  };

  const handleStartLink = () => {
    if (selectedNode) {
      setIsLinking(true);
      setLinkSource(selectedNode);
    }
  };

  // Memoize node position lookup
  const getNodePosition = useCallback((id: string) => {
    return nodePositions.find(p => p.id === id);
  }, [nodePositions]);

  // Memoize edges to avoid recalculating on every render
  const edges = useMemo(() => {
    const nodeWidth = 288;
    const nodeHeight = 280;
    const arrowOffset = 20; // Gap between the two lines
    
    const getPos = (id: string) => nodePositions.find(p => p.id === id);
    
    return relationships.map((rel) => {
      const source = getPos(rel.sourceId);
      const target = getPos(rel.targetId);
      
      if (!source || !target) return null;

      // Calculate angle between nodes
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const angle = Math.atan2(dy, dx);
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate edge points at node boundaries
      const sourceEdgeX = source.x + Math.cos(angle) * (nodeWidth / 2);
      const sourceEdgeY = source.y + Math.sin(angle) * (nodeHeight / 2 - 40);
      const targetEdgeX = target.x - Math.cos(angle) * (nodeWidth / 2);
      const targetEdgeY = target.y - Math.sin(angle) * (nodeHeight / 2 - 40);
      
      // Perpendicular offset for parallel lines
      const perpX = Math.sin(angle) * arrowOffset;
      const perpY = -Math.cos(angle) * arrowOffset;

      // Color based on relationship type
      const colors = {
        mirror: { stroke: '#3b82f6', glow: 'rgba(59, 130, 246, 0.5)' },
        partial: { stroke: '#eab308', glow: 'rgba(234, 179, 8, 0.5)' },
        inverse: { stroke: '#a855f7', glow: 'rgba(168, 85, 247, 0.5)' },
      };
      const color = colors[rel.logic];

      return (
        <g key={rel.id} className="transition-opacity duration-300">
          {/* Glow effect */}
          <line
            x1={sourceEdgeX + perpX / 2}
            y1={sourceEdgeY + perpY / 2}
            x2={targetEdgeX + perpX / 2}
            y2={targetEdgeY + perpY / 2}
            stroke={color.glow}
            strokeWidth="6"
            strokeLinecap="round"
            opacity={rel.isActive ? 0.4 : 0.1}
          />
          <line
            x1={sourceEdgeX - perpX / 2}
            y1={sourceEdgeY - perpY / 2}
            x2={targetEdgeX - perpX / 2}
            y2={targetEdgeY - perpY / 2}
            stroke={color.glow}
            strokeWidth="6"
            strokeLinecap="round"
            opacity={rel.isActive ? 0.4 : 0.1}
          />
          
          {/* Top line: Source -> Target */}
          <line
            x1={sourceEdgeX + perpX / 2}
            y1={sourceEdgeY + perpY / 2}
            x2={targetEdgeX + perpX / 2}
            y2={targetEdgeY + perpY / 2}
            stroke={color.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity={rel.isActive ? 1 : 0.4}
            strokeDasharray={rel.isActive ? undefined : '8,4'}
            markerEnd="url(#arrowRight)"
          />
          
          {/* Bottom line: Target -> Source */}
          <line
            x1={targetEdgeX - perpX / 2}
            y1={targetEdgeY - perpY / 2}
            x2={sourceEdgeX - perpX / 2}
            y2={sourceEdgeY - perpY / 2}
            stroke={color.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity={rel.isActive ? 1 : 0.4}
            strokeDasharray={rel.isActive ? undefined : '8,4'}
            markerEnd="url(#arrowLeft)"
          />
          
          {/* Center label background */}
          <rect
            x={(source.x + target.x) / 2 - 40}
            y={(source.y + target.y) / 2 - 12}
            width="80"
            height="24"
            rx="12"
            fill="rgba(0,0,0,0.8)"
            stroke={color.stroke}
            strokeWidth="1"
          />
          
          {/* Center label text */}
          <text
            x={(source.x + target.x) / 2}
            y={(source.y + target.y) / 2 + 4}
            fill="white"
            fontSize="11"
            fontWeight="500"
            textAnchor="middle"
          >
            {rel.offsetPercentage}% {rel.logic}
          </text>
        </g>
      );
    });
  }, [relationships, nodePositions]);

  const selectedAccount = accounts.find(a => a.id === selectedNode);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background rounded-xl border border-border/30">
      {/* Controls */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border/30 shadow-sm">
          <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border" />
          <Button variant="ghost" size="icon" onClick={handleResetView} className="h-8 w-8">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Legend */}
        <div className="p-3 rounded-lg bg-card border border-border/30 shadow-sm space-y-2">
          <p className="text-xs font-medium text-foreground">Account Types</p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-yellow-500/50 border border-yellow-500" />
              <span className="text-xs text-muted-foreground">Prop (Evaluation)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-emerald-500/50 border border-emerald-500" />
              <span className="text-xs text-muted-foreground">Funded</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-blue-500/50 border border-blue-500" />
              <span className="text-xs text-muted-foreground">Hedge</span>
            </div>
          </div>
          {relationships.length > 0 && (
            <>
              <div className="h-px bg-border my-2" />
              <p className="text-xs font-medium text-foreground">Relationships</p>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 bg-blue-500" />
                  <span className="text-xs text-muted-foreground">Mirror</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 bg-yellow-500" />
                  <span className="text-xs text-muted-foreground">Partial</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 bg-purple-500" />
                  <span className="text-xs text-muted-foreground">Inverse</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top Right Actions */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {selectedNode && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartLink}
              className={cn(
                'gap-2',
                isLinking && 'bg-primary text-primary-foreground'
              )}
            >
              <Link2 className="h-4 w-4" />
              {isLinking ? 'Select Target...' : 'Link Account'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedNode && onDeleteAccount(selectedNode)}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        )}
        <Button onClick={onAddAccount} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* Linking Indicator */}
      {isLinking && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium animate-pulse flex items-center gap-2">
          <ArrowRight className="h-4 w-4" />
          Click another account to create hedge relationship
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="map-canvas absolute inset-0 cursor-grab active:cursor-grabbing bg-muted/5"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Edges SVG Layer */}
        <svg 
          ref={svgTransformRef}
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          style={{
            transform: `translate(${containerSize.width / 2 + pan.x}px, ${containerSize.height / 2 + pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {/* Arrow markers for bidirectional lines */}
          <defs>
            <marker
              id="arrowRight"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M2,2 L10,6 L2,10 L4,6 Z" fill="currentColor" className="text-current" />
            </marker>
            <marker
              id="arrowLeft"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M2,2 L10,6 L2,10 L4,6 Z" fill="currentColor" className="text-current" />
            </marker>
          </defs>
          {edges}
        </svg>

        {/* Nodes Container */}
        <div
          ref={transformRef}
          className="absolute inset-0 overflow-visible"
          style={{
            transform: `translate(${containerSize.width / 2 + pan.x}px, ${containerSize.height / 2 + pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {accounts.length > 0 && accounts.map((account) => {
            const position = getNodePosition(account.id);
            return (
              <HedgeNode
                key={account.id}
                account={account}
                isSelected={selectedNode === account.id}
                onClick={() => handleNodeClick(account.id)}
                position={position}
              />
            );
          })}
        </div>

        {/* Empty State - Outside Transform */}
        {accounts.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-4 pointer-events-auto">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                <Plus className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">No accounts yet</h3>
                <p className="text-sm text-muted-foreground">
                  Add your first account to get started
                </p>
              </div>
              <Button onClick={onAddAccount} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Account
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Selected Account Details Panel */}
      {selectedAccount && (
        <div className="absolute bottom-4 left-4 right-4 z-20 p-4 rounded-lg bg-card/90 backdrop-blur-md border border-border/30 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h3 className="font-semibold text-foreground">{selectedAccount.account_name}</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedAccount.prop_firm || selectedAccount.platform || 'Personal Account'}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {selectedAccount.phase === 'evaluation' ? 'PROP' : 
                 selectedAccount.phase === 'funded' ? 'FUNDED' : 'HEDGE'}
              </Badge>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Size: </span>
                <span className="font-medium text-foreground">
                  ${Number(selectedAccount.account_size).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Equity: </span>
                <span className="font-medium text-foreground">
                  ${Number(selectedAccount.current_balance).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">P&L: </span>
                <span className={cn(
                  'font-medium',
                  Number(selectedAccount.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {Number(selectedAccount.pnl) >= 0 ? '+' : ''}
                  ${Number(selectedAccount.pnl).toLocaleString()} 
                  ({Number(selectedAccount.pnl_percent) >= 0 ? '+' : ''}
                  {Number(selectedAccount.pnl_percent).toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
