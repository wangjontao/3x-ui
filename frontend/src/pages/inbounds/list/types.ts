import type { NodeRecord } from '@/api/queries/useNodesQuery';
import type { HostRecord } from '@/schemas/api/host';

export interface StreamHints {
  network: string;
  isTls: boolean;
  isReality: boolean;
}

export type ProtocolFlags = {
  isVMess?: boolean;
  isVLess?: boolean;
  isTrojan?: boolean;
  isSS?: boolean;
  isHysteria?: boolean;
  isMixed?: boolean;
  isHTTP?: boolean;
  isWireguard?: boolean;
  isAmneziawg?: boolean;
  isTuic?: boolean;
  isTunnel?: boolean;
};

export interface DBInboundRecord extends ProtocolFlags {
  id: number;
  enable: boolean;
  remark: string;
  subSortIndex: number;
  port: number;
  protocol: string;
  up: number;
  down: number;
  total: number;
  expiryTime: number;
  _expiryTime: { valueOf(): number } | null;
  nodeId?: number | null;
  settings: unknown;
  streamSettings: unknown;
  clientStats?: Array<{
    email: string;
    up: number;
    down: number;
    total: number;
    expiryTime: number;
    enable?: boolean;
  }>;
}

export interface ClientCountEntry {
  clients: number;
  active: string[];
  deactive: string[];
  depleted: string[];
  expiring: string[];
  online: string[];
}

export interface InboundSpeedEntry {
  up: number;
  down: number;
}

export type RowAction =
  | 'edit'
  | 'addClient'
  | 'bulkCreateClients'
  | 'resetClientsTraffic'
  | 'showInfo'
  | 'qrcode'
  | 'export'
  | 'subs'
  | 'clipboard'
  | 'delete'
  | 'resetTraffic'
  | 'delAllClients'
  | 'clone';

export type GeneralAction = 'import' | 'export' | 'exportClients' | 'subs' | 'resetInbounds';

export type ClientRowAction = 'qrcode' | 'info' | 'manage' | 'resetTraffic';

export interface InboundListProps {
  dbInbounds: DBInboundRecord[];
  clientCount: Record<number, ClientCountEntry>;
  onlineClients: string[];
  lastOnlineMap: Record<string, number>;
  inboundSpeed: Record<number, InboundSpeedEntry>;
  expireDiff: number;
  trafficDiff: number;
  pageSize: number;
  isMobile: boolean;
  subEnable: boolean;
  nodesById: Map<number, NodeRecord>;
  hasActiveNode: boolean;
  hosts: HostRecord[];
  onAddInbound: () => void;
  onOneClick: () => void;
  onGeneralAction: (key: GeneralAction) => void;
  onRowAction: (action: { key: RowAction; dbInbound: DBInboundRecord }) => void;
  onClientAction: (action: {
    key: ClientRowAction;
    dbInbound: DBInboundRecord;
    email: string;
  }) => void;
  onClientEnable: (email: string, enable: boolean) => Promise<void>;
  onBulkDelete: (ids: number[]) => Promise<boolean>;
}
