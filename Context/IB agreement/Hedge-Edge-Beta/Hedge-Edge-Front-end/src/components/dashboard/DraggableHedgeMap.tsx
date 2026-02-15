import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TradingAccount } from '@/hooks/useTradingAccounts';
import { HedgeNode } from './HedgeNode';
import { MapNode } from './MapNode';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useSidebar } from '@/contexts/SidebarContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  Plus,
  Sparkles,
  Trash2,
  Link2,
  GitBranch,
  X,
  Settings2,
} from 'lucide-react';
import type { ConnectionStatus } from '@/contexts/CopierGroupsContext';
import type { ConnectionSnapshot } from '@/types/connections';

export interface HedgeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  offsetPercentage: number;
  logic: 'mirror' | 'partial' | 'inverse';
  isActive: boolean;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
}

interface DraggableHedgeMapProps {
  accounts: TradingAccount[];
  relationships?: HedgeRelationship[];
  onAddAccount: () => void;
  onDeleteAccount: (id: string) => void;
  onCreateRelationship?: (sourceId: string, targetId: string, logic: HedgeRelationship['logic'], offsetPercentage: number) => void;
  onDeleteRelationship?: (id: string) => void;
  onUpdateRelationship?: (id: string, updates: Partial<HedgeRelationship>) => void;
  onPositionsChange?: (positions: NodePosition[]) => void;
  onAccountClick?: (account: TradingAccount) => void;
  autoAlignOnMount?: boolean;
  /** Get the copier connection status for a given source→target pair */
  getConnectionStatus?: (sourceId: string, targetId: string) => ConnectionStatus;
  /** Get the connection snapshot for an account (by login or id) */
  getAccountSnapshot?: (key: string) => ConnectionSnapshot | null;
}

// Local storage key for positions
const POSITIONS_KEY = 'hedge_edge_node_positions';
const ZOOM_KEY = 'hedge_edge_map_zoom';
const PAN_KEY = 'hedge_edge_map_pan';
const GRID_SIZE = 20; // Snap grid size

// Card dimensions for layout calculations
const CARD_WIDTH = 288;
const CARD_HEIGHT = 240;
const HORIZONTAL_GAP = 400; // Gap between columns
const VERTICAL_GAP = 120; // Gap between cards in same column

const getStoredPositions = (): NodePosition[] => {
  try {
    const stored = localStorage.getItem(POSITIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const savePositions = (positions: NodePosition[]) => {
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
};

const getStoredZoom = (): number => {
  try {
    const stored = localStorage.getItem(ZOOM_KEY);
    return stored ? parseFloat(stored) : 1;
  } catch {
    return 1;
  }
};

const saveZoom = (zoom: number) => {
  localStorage.setItem(ZOOM_KEY, zoom.toString());
};

const getStoredPan = (): { x: number; y: number } => {
  try {
    const stored = localStorage.getItem(PAN_KEY);
    return stored ? JSON.parse(stored) : { x: 0, y: 0 };
  } catch {
    return { x: 0, y: 0 };
  }
};

const savePan = (pan: { x: number; y: number }) => {
  localStorage.setItem(PAN_KEY, JSON.stringify(pan));
};

// Snap to grid helper
const snapToGrid = (value: number): number => {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
};

// Circular node dimensions (MapNode for evaluation/funded accounts)
const CIRCLE_NODE_RADIUS = 48; // w-24 h-24 = 96px diameter, so radius = 48

// Calculate edge point of a card for line attachment
const getCardEdgePoint = (
  cardPos: { x: number; y: number },
  targetPos: { x: number; y: number },
  cardWidth: number = CARD_WIDTH,
  cardHeight: number = CARD_HEIGHT
): { x: number; y: number } => {
  const dx = targetPos.x - cardPos.x;
  const dy = targetPos.y - cardPos.y;
  const angle = Math.atan2(dy, dx);
  
  // Calculate intersection with card edge
  const halfWidth = cardWidth / 2;
  const halfHeight = cardHeight / 2;
  
  // Check which edge the line intersects
  const tanAngle = Math.abs(Math.tan(angle));
  const aspectRatio = halfHeight / halfWidth;
  
  let edgeX: number, edgeY: number;
  
  if (tanAngle < aspectRatio) {
    // Intersects left or right edge
    edgeX = dx > 0 ? halfWidth : -halfWidth;
    edgeY = edgeX * Math.tan(angle);
  } else {
    // Intersects top or bottom edge
    edgeY = dy > 0 ? halfHeight : -halfHeight;
    edgeX = edgeY / Math.tan(angle);
  }
  
  return { x: cardPos.x + edgeX, y: cardPos.y + edgeY };
};

// Calculate edge point for circular nodes (MapNode)
const getCircleEdgePoint = (
  circlePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  radius: number = CIRCLE_NODE_RADIUS
): { x: number; y: number } => {
  const dx = targetPos.x - circlePos.x;
  const dy = targetPos.y - circlePos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance === 0) return circlePos;
  
  // Normalize and multiply by radius to get edge point
  const edgeX = circlePos.x + (dx / distance) * radius;
  const edgeY = circlePos.y + (dy / distance) * radius;
  
  return { x: edgeX, y: edgeY };
};

export const DraggableHedgeMap = ({ 
  accounts, 
  relationships = [],
  onAddAccount, 
  onDeleteAccount,
  onCreateRelationship,
  onDeleteRelationship,
  onUpdateRelationship,
  onAccountClick,
  autoAlignOnMount = true,
  getConnectionStatus: getConnectionStatusProp,
  getAccountSnapshot,
}: DraggableHedgeMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const hasAutoAligned = useRef(false);
  const autoAlignRef = useRef<(() => void) | null>(null);
  const { toast } = useToast();
  const { collapsed, setCollapsed } = useSidebar();
  const [zoom, setZoom] = useState(getStoredZoom);
  const [pan, setPan] = useState(getStoredPan);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<NodePosition[]>(getStoredPositions);
  const nodePositionsRef = useRef(nodePositions);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [linkConfigOpen, setLinkConfigOpen] = useState(false);
  const [linkConfig, setLinkConfig] = useState<{ logic: HedgeRelationship['logic']; offsetPercentage: number }>({
    logic: 'inverse',
    offsetPercentage: 100,
  });
  const [editingLink, setEditingLink] = useState<HedgeRelationship | null>(null);

  // Keep refs in sync with state
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { nodePositionsRef.current = nodePositions; }, [nodePositions]);

  // Direct DOM update for smooth transforms (bypasses React re-renders)
  const updateTransform = useCallback(() => {
    // The element is already positioned at left: containerSize.width/2, top: containerSize.height/2
    // So we only need to apply the pan offset and scale
    const transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
    if (transformRef.current) transformRef.current.style.transform = transform;
  }, []);

  // Track container size
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
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', updateSize);
      resizeObserver.disconnect();
    };
  }, []);

  // Auto-align on mount when container and accounts are ready
  // BUT only if no positions exist for these accounts (fresh start)
  useEffect(() => {
    if (autoAlignOnMount && !hasAutoAligned.current && containerSize.width > 0 && accounts.length > 0) {
      // Check if we already have stored positions for any of these accounts
      const storedPositions = getStoredPositions();
      const accountIds = accounts.map(a => a.id);
      const hasExistingPositions = accountIds.some(id => storedPositions.some(p => p.id === id));
      
      hasAutoAligned.current = true;
      
      // Only auto-align if there are no existing positions
      if (!hasExistingPositions) {
        setTimeout(() => {
          autoAlignRef.current?.();
        }, 100);
      }
    }
  }, [autoAlignOnMount, containerSize, accounts.length]);

  // Initialize positions for new accounts
  useEffect(() => {
    const existingIds = nodePositions.map(p => p.id);
    const newAccounts = accounts.filter(a => !existingIds.includes(a.id));
    
    if (newAccounts.length > 0) {
      const newPositions = [...nodePositions];
      newAccounts.forEach((account, index) => {
        const angle = (index * 137.5) * (Math.PI / 180);
        const radius = 150 + index * 30;
        newPositions.push({
          id: account.id,
          x: snapToGrid(Math.cos(angle) * radius),
          y: snapToGrid(Math.sin(angle) * radius),
        });
      });
      setNodePositions(newPositions);
      savePositions(newPositions);
    }
    
    const currentIds = accounts.map(a => a.id);
    const filteredPositions = nodePositions.filter(p => currentIds.includes(p.id));
    if (filteredPositions.length !== nodePositions.length) {
      setNodePositions(filteredPositions);
      savePositions(filteredPositions);
    }
  }, [accounts]);

  // Auto-align function with intelligent positioning
  const autoAlign = () => {
    if (accounts.length === 0) return;
    
    const hedgeAccounts = accounts.filter(a => a.phase === 'live');
    const linkedAccounts = accounts.filter(a => a.phase !== 'live');
    const newPositions: NodePosition[] = [];
    
    // Spacing configuration
    const verticalSpacing = CARD_HEIGHT + VERTICAL_GAP;
    const horizontalSpacing = CARD_WIDTH + HORIZONTAL_GAP;
    
    // Build connection map
    const hedgeConnections: Map<string, string[]> = new Map();
    const linkedToHedge: Map<string, string> = new Map();
    
    hedgeAccounts.forEach(h => hedgeConnections.set(h.id, []));
    
    linkedAccounts.forEach(linked => {
      const rel = relationships.find(
        r => r.sourceId === linked.id || r.targetId === linked.id
      );
      if (rel) {
        const hedgeId = rel.sourceId === linked.id ? rel.targetId : rel.sourceId;
        if (hedgeConnections.has(hedgeId)) {
          hedgeConnections.get(hedgeId)!.push(linked.id);
          linkedToHedge.set(linked.id, hedgeId);
        }
      }
    });
    
    // Get unlinked accounts
    const unlinkedLinkedAccounts = linkedAccounts.filter(a => !linkedToHedge.has(a.id));
    
    // CASE 1: Only 2 nodes total and they are connected -> place them parallel (side by side)
    if (accounts.length === 2) {
      const [first, second] = accounts;
      const areConnected = relationships.some(
        r => (r.sourceId === first.id && r.targetId === second.id) ||
             (r.sourceId === second.id && r.targetId === first.id)
      );
      
      if (areConnected) {
        // Place them side by side, horizontally centered
        const hedge = first.phase === 'live' ? first : second;
        const linked = first.phase === 'live' ? second : first;
        
        newPositions.push({ id: hedge.id, x: -horizontalSpacing / 2, y: 0 });
        newPositions.push({ id: linked.id, x: horizontalSpacing / 2, y: 0 });
      } else {
        // Not connected, stack vertically centered
        newPositions.push({ id: first.id, x: 0, y: -verticalSpacing / 2 });
        newPositions.push({ id: second.id, x: 0, y: verticalSpacing / 2 });
      }
    }
    // CASE 2: Multiple nodes - use column-based layout
    else {
      // Position hedge accounts in left column, linked accounts in right column
      // Align connected pairs at the same Y level
      
      let currentY = 0;
      const processedLinked = new Set<string>();
      
      // First, position hedge accounts with their connected accounts
      hedgeAccounts.forEach((hedge, hedgeIdx) => {
        const connected = hedgeConnections.get(hedge.id) || [];
        const groupSize = Math.max(1, connected.length);
        
        if (connected.length === 0) {
          // Hedge with no connections - position alone
          newPositions.push({
            id: hedge.id,
            x: -horizontalSpacing / 2,
            y: currentY,
          });
          currentY += verticalSpacing;
        } else if (connected.length === 1) {
          // Single connection - place at same Y level (parallel)
          const linkedId = connected[0];
          newPositions.push({
            id: hedge.id,
            x: -horizontalSpacing / 2,
            y: currentY,
          });
          newPositions.push({
            id: linkedId,
            x: horizontalSpacing / 2,
            y: currentY,
          });
          processedLinked.add(linkedId);
          currentY += verticalSpacing;
        } else {
          // Multiple connections - hedge centered, linked accounts stacked
          const groupHeight = (connected.length - 1) * verticalSpacing;
          const hedgeY = currentY + groupHeight / 2;
          
          newPositions.push({
            id: hedge.id,
            x: -horizontalSpacing / 2,
            y: hedgeY,
          });
          
          connected.forEach((linkedId, idx) => {
            newPositions.push({
              id: linkedId,
              x: horizontalSpacing / 2,
              y: currentY + idx * verticalSpacing,
            });
            processedLinked.add(linkedId);
          });
          
          currentY += groupHeight + verticalSpacing;
        }
        
        // Add spacing between hedge groups
        if (hedgeIdx < hedgeAccounts.length - 1) {
          currentY += verticalSpacing * 0.5;
        }
      });
      
      // Position unlinked linked accounts (evaluation/funded with no hedge connection)
      unlinkedLinkedAccounts.forEach((account, idx) => {
        if (!processedLinked.has(account.id)) {
          newPositions.push({
            id: account.id,
            x: horizontalSpacing / 2,
            y: currentY + idx * verticalSpacing,
          });
        }
      });
      
      // Handle case where there are only linked accounts (no hedge accounts)
      if (hedgeAccounts.length === 0) {
        linkedAccounts.forEach((account, idx) => {
          newPositions.push({
            id: account.id,
            x: 0,
            y: idx * verticalSpacing,
          });
        });
      }
    }
    
    // Center the entire layout
    if (newPositions.length > 0) {
      const allY = newPositions.map(p => p.y);
      const allX = newPositions.map(p => p.x);
      const centerY = (Math.min(...allY) + Math.max(...allY)) / 2;
      const centerX = (Math.min(...allX) + Math.max(...allX)) / 2;
      newPositions.forEach(p => {
        p.y -= centerY;
        p.x -= centerX;
      });
    }
    
    setNodePositions(newPositions);
    savePositions(newPositions);
    setPan({ x: 0, y: 0 });
    savePan({ x: 0, y: 0 });
    
    // Calculate actual bounding box from positions
    const allX = newPositions.map(p => p.x);
    const finalAllY = newPositions.map(p => p.y);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...finalAllY);
    const maxY = Math.max(...finalAllY);
    
    // Content size = distance between extremes + card dimensions
    const contentWidth = (maxX - minX) + CARD_WIDTH;
    const contentHeight = (maxY - minY) + CARD_HEIGHT;
    
    // Add generous padding
    const paddedWidth = contentWidth + 150;
    const paddedHeight = contentHeight + 150;
    
    // Calculate zoom to fit all nodes in view
    const zoomX = containerSize.width / paddedWidth;
    const zoomY = containerSize.height / paddedHeight;
    const fitZoom = Math.min(zoomX, zoomY);
    
    // Clamp zoom - no minimum, allow zooming out as much as needed to show all nodes
    const newZoom = Math.min(fitZoom, 1);
    setZoom(newZoom);
    saveZoom(newZoom);
  };

  // Keep ref updated
  autoAlignRef.current = autoAlign;

  // Fit all nodes in view
  const fitToView = () => {
    if (nodePositions.length === 0) return;
    
    const minX = Math.min(...nodePositions.map(p => p.x));
    const maxX = Math.max(...nodePositions.map(p => p.x));
    const minY = Math.min(...nodePositions.map(p => p.y));
    const maxY = Math.max(...nodePositions.map(p => p.y));
    
    // Account for actual card dimensions, not just center points
    const contentWidth = (maxX - minX) + CARD_WIDTH;
    const contentHeight = (maxY - minY) + CARD_HEIGHT;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Add padding
    const paddedWidth = contentWidth + 100;
    const paddedHeight = contentHeight + 100;
    
    const zoomX = containerSize.width / paddedWidth;
    const zoomY = containerSize.height / paddedHeight;
    const fitZoom = Math.min(zoomX, zoomY);
    
    // Clamp - no minimum, allow zooming out as needed to show all nodes
    const finalZoom = Math.min(fitZoom, 1);
    const newPan = { x: -centerX * finalZoom, y: -centerY * finalZoom };
    setZoom(finalZoom);
    setPan(newPan);
    saveZoom(finalZoom);
    savePan(newPan);
  };

  // Mouse handlers for panning
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-bg')) {
      setIsPanning(true);
      // Use panRef.current to ensure we're using the latest pan value
      panStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
      setSelectedNode(null);
      setSelectedLink(null);
      
      // Cancel linking mode on canvas click
      if (isLinking) {
        setIsLinking(false);
        setLinkSource(null);
        toast({
          title: 'Linking cancelled',
          description: 'Click on a node to start linking again.',
        });
      }
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      // Update ref directly for smooth panning (no React re-render)
      panRef.current = { x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y };
      updateTransform();
    } else if (draggingNode) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const centerX = containerSize.width / 2;
        const centerY = containerSize.height / 2;
        let newX = (e.clientX - rect.left - centerX - panRef.current.x) / zoomRef.current - dragOffset.x;
        let newY = (e.clientY - rect.top - centerY - panRef.current.y) / zoomRef.current - dragOffset.y;
        
        // Snap to grid
        newX = snapToGrid(newX);
        newY = snapToGrid(newY);
        
        // Bounds check - keep within reasonable area
        const maxBound = 2000;
        newX = Math.max(-maxBound, Math.min(maxBound, newX));
        newY = Math.max(-maxBound, Math.min(maxBound, newY));
        
        // Update the specific node's position directly in DOM for smoothness
        const nodeEl = document.querySelector(`[data-node-id="${draggingNode}"]`) as HTMLElement;
        if (nodeEl) {
          nodeEl.style.left = `${newX}px`;
          nodeEl.style.top = `${newY}px`;
        }
        // Also update ref for when we sync back to state
        nodePositionsRef.current = nodePositionsRef.current.map(p => 
          p.id === draggingNode ? { ...p, x: newX, y: newY } : p
        );
      }
    }
  }, [isPanning, draggingNode, dragOffset, containerSize, updateTransform]);

  const handleMouseUp = () => {
    if (draggingNode) {
      // Sync ref back to state and save
      setNodePositions(nodePositionsRef.current);
      savePositions(nodePositionsRef.current);
    }
    if (isPanning) {
      // Sync pan ref back to state
      setPan(panRef.current);
      savePan(panRef.current);
    }
    setIsPanning(false);
    setDraggingNode(null);
  };

  // Cancel linking with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLinking) {
          setIsLinking(false);
          setLinkSource(null);
          toast({ title: 'Linking cancelled' });
        }
        if (selectedLink) {
          setSelectedLink(null);
        }
      }
      if (e.key === 'Delete' && selectedLink && onDeleteRelationship) {
        onDeleteRelationship(selectedLink);
        setSelectedLink(null);
        toast({ title: 'Link deleted 🗑️' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLinking, selectedLink, onDeleteRelationship]);

  // Node interaction
  const handleNodeMouseDown = (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (isLinking && linkSource) {
      if (linkSource !== accountId) {
        const sourceAccount = accounts.find(a => a.id === linkSource);
        const targetAccount = accounts.find(a => a.id === accountId);
        
        if (sourceAccount && targetAccount) {
          const sourceIsHedge = sourceAccount.phase === 'live';
          const targetIsHedge = targetAccount.phase === 'live';
          
          // ONLY hedge↔non-hedge connections allowed
          if (sourceIsHedge === targetIsHedge) {
            toast({
              title: 'Invalid connection ⛔',
              description: sourceIsHedge 
                ? 'Hedge accounts cannot link to other hedge accounts.'
                : 'Prop/Funded accounts can only link to hedge accounts.',
              variant: 'destructive',
            });
            setIsLinking(false);
            setLinkSource(null);
            return;
          }
          
          // Check if already exists
          const exists = relationships.some(
            r => (r.sourceId === linkSource && r.targetId === accountId) ||
                 (r.sourceId === accountId && r.targetId === linkSource)
          );
          
          if (exists) {
            toast({
              title: 'Link exists ⚠️',
              description: 'These accounts are already linked.',
              variant: 'destructive',
            });
            setIsLinking(false);
            setLinkSource(null);
            return;
          }

          // Funded/Evaluation accounts can only connect to ONE hedge account
          const propAccount = sourceIsHedge ? targetAccount : sourceAccount;
          if (propAccount.phase === 'evaluation' || propAccount.phase === 'funded') {
            const alreadyLinked = relationships.some(
              r => r.sourceId === propAccount.id || r.targetId === propAccount.id
            );
            if (alreadyLinked) {
              toast({
                title: 'Already connected ⛔',
                description: `${propAccount.account_name} is already linked to a hedge account. Remove the existing connection first.`,
                variant: 'destructive',
              });
              setIsLinking(false);
              setLinkSource(null);
              return;
            }
          }
          
          // Create inverse link directly (no config needed)
          if (onCreateRelationship) {
            onCreateRelationship(linkSource, accountId, 'inverse', 100);
            toast({
              title: 'Accounts linked 🔗',
              description: 'Inverse hedge relationship created.',
            });
          }
        }
      }
      setIsLinking(false);
      setLinkSource(null);
      return;
    }
    
    setSelectedNode(accountId);
    setSelectedLink(null);
    setDraggingNode(accountId);
    
    const pos = nodePositions.find(p => p.id === accountId);
    if (pos && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = containerSize.width / 2;
      const centerY = containerSize.height / 2;
      const nodeScreenX = centerX + pan.x + pos.x * zoom;
      const nodeScreenY = centerY + pan.y + pos.y * zoom;
      setDragOffset({
        x: ((e.clientX - rect.left) - nodeScreenX) / zoom,
        y: ((e.clientY - rect.top) - nodeScreenY) / zoom,
      });
    }
  };

  // Link click handler
  const handleLinkClick = (relationshipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLink(relationshipId);
    setSelectedNode(null);
  };

  // Edit link
  const handleEditLink = () => {
    const link = relationships.find(r => r.id === selectedLink);
    if (link) {
      setEditingLink(link);
      setLinkConfig({ logic: link.logic, offsetPercentage: link.offsetPercentage });
      setLinkConfigOpen(true);
    }
  };

  // Save link edits
  const handleSaveLinkEdit = () => {
    if (editingLink && onUpdateRelationship) {
      onUpdateRelationship(editingLink.id, {
        logic: linkConfig.logic,
        offsetPercentage: linkConfig.offsetPercentage,
      });
      toast({
        title: 'Link updated ✅',
        description: `Changed to ${linkConfig.logic} at ${linkConfig.offsetPercentage}%.`,
      });
    }
    setLinkConfigOpen(false);
    setEditingLink(null);
    setSelectedLink(null);
  };

  // Zoom handlers (5% increments)
  const handleZoomIn = () => setZoom(z => {
    const newZoom = Math.min(z + 0.05, 2);
    saveZoom(newZoom);
    return newZoom;
  });
  const handleZoomOut = () => setZoom(z => {
    const newZoom = Math.max(z - 0.05, 0);
    saveZoom(newZoom);
    return newZoom;
  });
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    saveZoom(1);
    savePan({ x: 0, y: 0 });
  };

  // Wheel event handler for Ctrl+scroll zoom (5% increments)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      // Use 5% steps (0.05) regardless of scroll amount
      const step = e.deltaY < 0 ? 0.05 : -0.05;
      setZoom(z => {
        const newZoom = Math.max(0, Math.min(z + step, 2));
        saveZoom(newZoom);
        return newZoom;
      });
    }
  }, []);

  // Add native wheel event listener to prevent browser zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, []);

  const handleStartLink = () => {
    if (selectedNode) {
      const account = accounts.find(a => a.id === selectedNode);
      setIsLinking(true);
      setLinkSource(selectedNode);
      toast({
        title: `Linking from ${account?.account_name || 'account'}`,
        description: 'Click another node to connect, or press Escape to cancel.',
      });
    }
  };

  const handleCancelLink = () => {
    setIsLinking(false);
    setLinkSource(null);
  };

  const getNodePosition = (id: string) => nodePositions.find(p => p.id === id);

  // Calculate routers
  const getRouters = () => {
    const hedgeAccounts = accounts.filter(a => a.phase === 'live');
    const routers: { hedgeId: string; position: { x: number; y: number }; connectedIds: string[] }[] = [];
    
    hedgeAccounts.forEach(hedge => {
      const connectedRels = relationships.filter(
        r => r.sourceId === hedge.id || r.targetId === hedge.id
      );
      
      if (connectedRels.length >= 2) {
        const hedgePos = getNodePosition(hedge.id);
        if (hedgePos) {
          const connectedIds = connectedRels.map(r => 
            r.sourceId === hedge.id ? r.targetId : r.sourceId
          );
          
          const connectedPositions = connectedIds
            .map(id => getNodePosition(id))
            .filter(Boolean) as NodePosition[];
          
          if (connectedPositions.length > 0) {
            const avgX = connectedPositions.reduce((sum, p) => sum + p.x, 0) / connectedPositions.length;
            
            routers.push({
              hedgeId: hedge.id,
              position: {
                x: hedgePos.x + (avgX - hedgePos.x) * 0.5,
                y: hedgePos.y,
              },
              connectedIds,
            });
          }
        }
      }
    });
    
    return routers;
  };

  const routers = getRouters();

  // Get line color based on copier connection status (active/paused/error)
  const getStatusColor = (status: ConnectionStatus): string => {
    switch (status) {
      case 'active': return '#22c55e';  // green - live connection
      case 'paused': return '#eab308';  // yellow - paused/dormant
      case 'error':  return '#ef4444';  // red - faulty
      case 'none':
      default:       return '#6b7280';  // gray - not configured
    }
  };

  // Get line color: use copier status (cross-validated with real connection) if available
  const getLineColor = (rel: HedgeRelationship): string => {
    if (getConnectionStatusProp) {
      let status = getConnectionStatusProp(rel.sourceId, rel.targetId);

      // Cross-validate: if copier says "active" but the hedge account's real
      // connection is down, downgrade the line to "error" so the visual matches reality
      if (status === 'active' && getAccountSnapshot) {
        const hedgeAccount = accounts.find(
          a => (a.id === rel.sourceId || a.id === rel.targetId) && a.phase === 'live',
        );
        if (hedgeAccount) {
          const snap = getAccountSnapshot(hedgeAccount.login || hedgeAccount.id);
          const realStatus = snap?.session?.status;
          if (realStatus && realStatus !== 'connected' && realStatus !== 'connecting') {
            status = 'error';
          }
        }
      }

      return getStatusColor(status);
    }
    // Fallback: color by logic type
    switch (rel.logic) {
      case 'mirror': return '#22c55e';
      case 'partial': return '#eab308';
      case 'inverse': return '#a855f7';
      default: return '#22c55e';
    }
  };

  // Get the connection status for a relationship (for node border coloring)
  // Cross-validates copier group status with real connection snapshots
  const getRelConnectionStatus = (accountId: string): ConnectionStatus => {
    if (!getConnectionStatusProp) return 'none';
    // Check all relationships involving this account
    for (const rel of relationships) {
      if (rel.sourceId === accountId || rel.targetId === accountId) {
        let status = getConnectionStatusProp(rel.sourceId, rel.targetId);

        // For active copier links, verify the hedge account's real connection
        if (status === 'active' && getAccountSnapshot) {
          const hedgeAccount = accounts.find(
            a => (a.id === rel.sourceId || a.id === rel.targetId) && a.phase === 'live',
          );
          if (hedgeAccount) {
            const snap = getAccountSnapshot(hedgeAccount.login || hedgeAccount.id);
            const realStatus = snap?.session?.status;
            if (realStatus && realStatus !== 'connected' && realStatus !== 'connecting') {
              return 'error';
            }
          }
        }

        if (status === 'error') return 'error';
        if (status === 'active') return 'active';
        if (status === 'paused') return 'paused';
      }
    }
    return 'none';
  };

  // Render connection lines with edge attachment
  const renderConnections = () => {
    const lines: JSX.Element[] = [];
    const hedgesWithRouters = new Set(routers.map(r => r.hedgeId));
    
    // Helper to get the correct edge point based on account type
    const getEdgePoint = (accountId: string, pos: { x: number; y: number }, targetPos: { x: number; y: number }) => {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return pos;
      
      // Circular nodes for evaluation/funded, card nodes for hedge (live)
      if (account.phase === 'evaluation' || account.phase === 'funded') {
        return getCircleEdgePoint(pos, targetPos);
      } else {
        return getCardEdgePoint(pos, targetPos);
      }
    };
    
    relationships
      .filter((rel) => {
        const sourceAccount = accounts.find(a => a.id === rel.sourceId);
        const targetAccount = accounts.find(a => a.id === rel.targetId);
        return !!sourceAccount && !!targetAccount;
      })
      .forEach((rel) => {
        const sourcePos = getNodePosition(rel.sourceId);
        const targetPos = getNodePosition(rel.targetId);
        if (!sourcePos || !targetPos) return;
        
        const isSelected = selectedLink === rel.id;
        const color = getLineColor(rel);
        const strokeWidth = isSelected ? 5 : 3;
        const glowWidth = isSelected ? 16 : 10;
        
        const sourceAccount = accounts.find(a => a.id === rel.sourceId);
        const hedgeId = sourceAccount?.phase === 'live' ? rel.sourceId : rel.targetId;
        const linkedId = sourceAccount?.phase === 'live' ? rel.targetId : rel.sourceId;
        const router = routers.find(r => r.hedgeId === hedgeId);
        
        if (router && hedgesWithRouters.has(hedgeId)) {
          const hedgePos = getNodePosition(hedgeId)!;
          const linkedPos = getNodePosition(linkedId)!;
          
          // Edge points using correct calculation based on node type
          const hedgeEdge = getEdgePoint(hedgeId, hedgePos, router.position);
          const linkedEdge = getEdgePoint(linkedId, linkedPos, router.position);
          
          // Hedge to router
          if (!lines.some(l => l.key === `router-line-${hedgeId}`)) {
            const pathToRouter = `M ${hedgeEdge.x} ${hedgeEdge.y} L ${router.position.x} ${router.position.y}`;
            lines.push(
              <g key={`router-line-${hedgeId}`} className="pointer-events-none">
                <path d={pathToRouter} fill="none" stroke={color} strokeWidth={glowWidth} strokeLinecap="round" opacity="0.1" />
                <path d={pathToRouter} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray="6,10" />
              </g>
            );
          }
          
          // Router to linked (clickable)
          const pathFromRouter = `M ${router.position.x} ${router.position.y} L ${linkedEdge.x} ${linkedEdge.y}`;
          lines.push(
            <g 
              key={`${rel.id}-from-router`} 
              className="cursor-pointer"
              onClick={(e) => handleLinkClick(rel.id, e)}
            >
              <path d={pathFromRouter} fill="none" stroke="transparent" strokeWidth="20" />
              <path d={pathFromRouter} fill="none" stroke={color} strokeWidth={glowWidth} strokeLinecap="round" opacity={isSelected ? 0.3 : 0.1} />
              <path d={pathFromRouter} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray="6,10" />
              {isSelected && (
                <circle cx={(router.position.x + linkedEdge.x) / 2} cy={(router.position.y + linkedEdge.y) / 2} r="8" fill={color} />
              )}
            </g>
          );
        } else {
          // Direct line with edge attachment
          const sourceEdge = getEdgePoint(rel.sourceId, sourcePos, targetPos);
          const targetEdge = getEdgePoint(rel.targetId, targetPos, sourcePos);
          const path = `M ${sourceEdge.x} ${sourceEdge.y} L ${targetEdge.x} ${targetEdge.y}`;
          
          lines.push(
            <g 
              key={rel.id} 
              className="cursor-pointer"
              onClick={(e) => handleLinkClick(rel.id, e)}
            >
              <path d={path} fill="none" stroke="transparent" strokeWidth="20" />
              <path d={path} fill="none" stroke={color} strokeWidth={glowWidth} strokeLinecap="round" opacity={isSelected ? 0.3 : 0.1} />
              <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray="6,10" />
              {isSelected && (
                <circle cx={(sourceEdge.x + targetEdge.x) / 2} cy={(sourceEdge.y + targetEdge.y) / 2} r="8" fill={color} />
              )}
            </g>
          );
        }
      });
    
    return lines;
  };

  // Render routers
  const renderRouters = () => {
    // Disable transitions when any node is being dragged
    const isAnyNodeDragging = draggingNode !== null;
    
    return routers.map((router, index) => {
      // Determine router status from connected relationships
      let routerStatus: ConnectionStatus = 'none';
      if (getConnectionStatusProp) {
        const statuses = router.connectedIds.map(id =>
          getConnectionStatusProp(router.hedgeId, id)
        );
        if (statuses.some(s => s === 'error')) routerStatus = 'error';
        else if (statuses.some(s => s === 'active')) routerStatus = 'active';
        else if (statuses.some(s => s === 'paused')) routerStatus = 'paused';
      }

      const routerGradient = routerStatus === 'active' ? 'from-green-400 to-green-600'
        : routerStatus === 'paused' ? 'from-yellow-400 to-yellow-600'
        : routerStatus === 'error' ? 'from-red-400 to-red-600'
        : 'from-emerald-400 to-green-600';

      const routerShadow = routerStatus === 'active' ? 'shadow-green-500/20'
        : routerStatus === 'paused' ? 'shadow-yellow-500/20'
        : routerStatus === 'error' ? 'shadow-red-500/20'
        : 'shadow-emerald-500/20';

      return (
        <div
          key={`router-${router.hedgeId}`}
          className="absolute"
          style={{
            left: router.position.x,
            top: router.position.y,
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
            transition: isAnyNodeDragging ? 'none' : `left 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${index * 50 + 100}ms, top 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${index * 50 + 100}ms`,
          }}
        >
          <div className="relative">
            <div className={cn(
              'w-14 h-14 rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg',
              routerGradient,
              routerShadow
            )}>
              <div className="w-7 h-7 rounded-full bg-black/20 border-2 border-white/30 flex items-center justify-center">
                <GitBranch className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-emerald-600 text-[10px] font-bold flex items-center justify-center shadow">
              {router.connectedIds.length}
            </div>
          </div>
        </div>
      );
    });
  };

  const sourceAccountName = linkSource ? accounts.find(a => a.id === linkSource)?.account_name : '';

  return (
    <div className="relative h-full w-full overflow-hidden bg-background rounded-xl border border-border/50">
      {/* Controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-card border border-border/50 shadow-sm">
          <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center font-mono">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} className="h-8 w-8" title="Collapse sidebar">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={autoAlign} className="h-8 w-8" title="Auto-align nodes">
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-1.5 px-3 py-2 rounded-lg bg-card border border-border/50 text-xs">
        {/* Account types */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <span className="text-muted-foreground">Evaluation</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Hedge</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Funded</span>
          </div>
        </div>
        {/* Connection statuses */}
        <div className="flex items-center gap-3 pt-1 border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 rounded bg-green-500" />
            <span className="text-muted-foreground">Live</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 rounded bg-yellow-500" />
            <span className="text-muted-foreground">Paused</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 rounded bg-red-500" />
            <span className="text-muted-foreground">Faulty</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {selectedLink && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEditLink}
              className="gap-2"
            >
              <Settings2 className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (onDeleteRelationship) {
                  onDeleteRelationship(selectedLink);
                  setSelectedLink(null);
                  toast({ title: 'Link deleted 🗑️' });
                }
              }}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
        {selectedNode && !isLinking && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartLink}
              className="gap-2"
            >
              <Link2 className="h-4 w-4" />
              Link
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onDeleteAccount(selectedNode);
                setSelectedNode(null);
              }}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
        {isLinking && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancelLink}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
        )}
        <Button onClick={onAddAccount} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* Linking indicator */}
      {isLinking && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium shadow-lg flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            <span>Linking from <strong>{sourceAccountName}</strong></span>
          </div>
          <div className="text-primary-foreground/70">Click a target node • Esc to cancel</div>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className={cn(
          "canvas-bg absolute inset-0 select-none",
          isPanning ? "cursor-grabbing" : "cursor-grab",
          isLinking && "cursor-crosshair",
          draggingNode && "cursor-grabbing"
        )}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Transform container */}
        <div
          ref={transformRef}
          className="absolute"
          style={{
            left: containerSize.width / 2,
            top: containerSize.height / 2,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {/* Connections SVG - transitions sync with node movements */}
          <svg
            className="absolute overflow-visible"
            style={{ 
              left: 0, 
              top: 0,
              // Disable pointer events on the SVG container, individual paths handle clicks
              pointerEvents: 'none',
            }}
            width="1"
            height="1"
          >
            <g style={{ pointerEvents: 'auto' }}>
              {renderConnections()}
            </g>
          </svg>

          {/* Router nodes */}
          {renderRouters()}

          {/* Nodes */}
          {accounts.length === 0 ? (
            <div 
              className="absolute text-center space-y-4"
              style={{
                left: '0',
                top: '0',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <button 
                onClick={onAddAccount}
                className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto transition-all hover:bg-muted/50 hover:scale-110 cursor-pointer"
              >
                <Plus className="w-10 h-10 text-muted-foreground" />
              </button>
              <div>
                <h3 className="text-lg font-medium text-foreground">No accounts yet</h3>
                <p className="text-sm text-muted-foreground">Add your first account to get started</p>
              </div>
            </div>
          ) : (
            accounts.map((account, index) => {
              const pos = getNodePosition(account.id);
              if (!pos) return null;
              const isDragging = draggingNode === account.id;
              const isSelected = selectedNode === account.id;
              const isLinkSource = linkSource === account.id;
              // Base z-index: newer accounts (lower index) get higher z-index since accounts are sorted by created_at DESC
              const baseZIndex = accounts.length - index;
              // Use circular MapNode for evaluation/funded, HedgeNode for hedge (live) accounts
              const isCircularNode = account.phase === 'evaluation' || account.phase === 'funded';
              // Disable ALL transitions when ANY node is being dragged to keep lines attached
              const isAnyNodeDragging = draggingNode !== null;
              return (
                <div
                  key={account.id}
                  data-node-id={account.id}
                  className="absolute"
                  style={{
                    left: pos.x,
                    top: pos.y,
                    transform: 'translate(-50%, -50%)',
                    zIndex: isDragging ? 1000 : isSelected ? 500 : isLinkSource ? 400 : baseZIndex,
                    transition: isAnyNodeDragging ? 'none' : `left 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${index * 30}ms, top 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${index * 30}ms`,
                    willChange: isDragging ? 'left, top' : 'auto',
                  }}
                >
                  {isCircularNode ? (
                    <MapNode
                      account={account}
                      isSelected={isSelected}
                      isDragging={isDragging}
                      isLinkSource={isLinkSource}
                      copierStatus={getRelConnectionStatus(account.id)}
                      onMouseDown={(e) => handleNodeMouseDown(account.id, e)}
                      onDoubleClick={() => {
                        if (onAccountClick) {
                          onAccountClick(account);
                        }
                      }}
                      onDetailsClick={() => {
                        if (onAccountClick) {
                          onAccountClick(account);
                        }
                      }}
                    />
                  ) : (
                    <HedgeNode
                      account={account}
                      isSelected={isSelected}
                      isDragging={isDragging}
                      isLinkSource={isLinkSource}
                      copierStatus={getRelConnectionStatus(account.id)}
                      connectionSnapshot={getAccountSnapshot?.(account.login || account.id) ?? undefined}
                      onMouseDown={(e) => handleNodeMouseDown(account.id, e)}
                      onDoubleClick={() => {
                        if (onAccountClick) {
                          onAccountClick(account);
                        }
                      }}
                      onDetailsClick={() => {
                        if (onAccountClick) {
                          onAccountClick(account);
                        }
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Edit Link Dialog */}
      <Dialog open={linkConfigOpen} onOpenChange={(open) => {
        if (!open) {
          setLinkConfigOpen(false);
          setEditingLink(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Link Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Link Type</Label>
              <Select
                value={linkConfig.logic}
                onValueChange={(value: HedgeRelationship['logic']) => 
                  setLinkConfig(prev => ({ ...prev, logic: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inverse">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500" />
                      Inverse (opposite direction)
                    </div>
                  </SelectItem>
                  <SelectItem value="mirror">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      Mirror (copy trades exactly)
                    </div>
                  </SelectItem>
                  <SelectItem value="partial">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      Partial (scaled position size)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Offset Percentage: {linkConfig.offsetPercentage}%</Label>
              <Slider
                value={[linkConfig.offsetPercentage]}
                onValueChange={([value]) => setLinkConfig(prev => ({ ...prev, offsetPercentage: value }))}
                min={10}
                max={200}
                step={10}
                className="py-2"
              />
              <p className="text-xs text-muted-foreground">
                Position size multiplier relative to source account
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setLinkConfigOpen(false);
              setEditingLink(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveLinkEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
