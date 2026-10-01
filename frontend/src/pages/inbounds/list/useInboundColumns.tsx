import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, Switch, Tag, Tooltip, type TableColumnType } from 'antd';
import { TeamOutlined } from '@ant-design/icons';

import { SizeFormatter, IntlUtil, ColorUtils } from '@/utils';
import { InfinityIcon } from '@/components/ui';
import { useDatepicker } from '@/hooks/useDatepicker';
import { coerceInboundJsonField } from '@/models/dbinbound';

import { RowActionsCell } from './RowActions';
import type { ClientCountEntry, DBInboundRecord, RowAction } from './types';

interface UseInboundColumnsParams {
  hasAnyRemark: boolean;
  hasAnySubSortIndex: boolean;
  hasActiveNode: boolean;
  nodesById: Map<number, unknown>;
  hostRemarksByInboundId: Map<number, string[]>;
  clientCount: Record<number, ClientCountEntry>;
  inboundSpeed: Record<number, unknown>;
  subEnable: boolean;
  expireDiff: number;
  trafficDiff: number;
  onRowAction: (action: { key: RowAction; dbInbound: DBInboundRecord }) => void;
  onSwitchEnable: (dbInbound: DBInboundRecord, next: boolean) => void;
}

export function useInboundColumns({
  hasAnyRemark,
  hostRemarksByInboundId,
  clientCount,
  subEnable,
  expireDiff,
  onRowAction,
  onSwitchEnable,
}: UseInboundColumnsParams): TableColumnType<DBInboundRecord>[] {
  const { t } = useTranslation();
  const { datepicker } = useDatepicker();

  return useMemo(() => {
    const compareText = (a: string | undefined | null, b: string | undefined | null) =>
      (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });

    const fallbackClientCount = (record: DBInboundRecord): ClientCountEntry | null => {
      const settings = coerceInboundJsonField(record.settings) as {
        clients?: { email?: string; enable?: boolean }[];
      };
      const clients = Array.isArray(settings.clients) ? settings.clients : [];
      if (clients.length === 0) return null;
      const active = clients
        .filter((client) => client.email && client.enable !== false)
        .map((client) => client.email!);
      const deactive = clients
        .filter((client) => client.email && client.enable === false)
        .map((client) => client.email!);
      return {
        clients: clients.length,
        active,
        deactive,
        depleted: [],
        expiring: [],
        online: [],
      };
    };

    const cols: TableColumnType<DBInboundRecord>[] = [
      {
        title: 'ID',
        dataIndex: 'id',
        key: 'id',
        align: 'center',
        width: 58,
        sorter: (a, b) => a.id - b.id,
      },
      {
        title: t('pages.inbounds.operate'),
        key: 'action',
        align: 'center',
        width: 76,
        render: (_, record) => (
          <RowActionsCell
            record={record}
            subEnable={subEnable}
            hasClients={(clientCount[record.id]?.clients || 0) > 0}
            onClick={(key) => onRowAction({ key, dbInbound: record })}
          />
        ),
      },
      {
        title: t('pages.inbounds.enable'),
        key: 'enable',
        align: 'center',
        width: 72,
        render: (_, record) => (
          <Switch size="small" checked={record.enable} onChange={(next) => onSwitchEnable(record, next)} />
        ),
      },
    ];

    if (hasAnyRemark) {
      cols.push({
        title: t('pages.inbounds.remark'),
        dataIndex: 'remark',
        key: 'remark',
        align: 'center',
        width: 160,
        sorter: (a, b) => compareText(a.remark, b.remark),
        render: (_, record) => {
          const extras = hostRemarksByInboundId.get(record.id) ?? [];
          return (
            <Tooltip title={extras.length > 0 ? extras.join(', ') : undefined}>
              <span>{record.remark || '-'}</span>
            </Tooltip>
          );
        },
      });
    }

    cols.push(
      {
        title: t('pages.inbounds.port'),
        dataIndex: 'port',
        key: 'port',
        align: 'center',
        width: 84,
        sorter: (a, b) => a.port - b.port,
      },
      {
        title: t('pages.inbounds.protocol'),
        key: 'protocol',
        align: 'left',
        width: 180,
        sorter: (a, b) => compareText(a.protocol, b.protocol),
        render: (_, record) => {
          const stream = coerceInboundJsonField(record.streamSettings) as {
            network?: string;
            security?: string;
          };
          const tags: ReactElement[] = [
            <Tag key="protocol" color="purple">
              {record.protocol}
            </Tag>,
          ];
          if (stream.network) tags.push(<Tag key="network" color="green">{stream.network}</Tag>);
          if (stream.security && stream.security !== 'none') {
            tags.push(<Tag key="security" color="blue">{stream.security}</Tag>);
          }
          return tags;
        },
      },
      {
        title: t('clients'),
        key: 'clients',
        align: 'center',
        width: 92,
        sorter: (a, b) =>
          (clientCount[a.id]?.clients || 0) - (clientCount[b.id]?.clients || 0),
        render: (_, record) => {
          const cc = clientCount[record.id] || fallbackClientCount(record);
          if (!cc) return <span>0</span>;
          return (
            <Tag className="client-count-tag" style={{ margin: 0 }}>
              <TeamOutlined /> {cc.clients}
            </Tag>
          );
        },
      },
      {
        title: t('pages.inbounds.traffic'),
        key: 'traffic',
        align: 'center',
        width: 150,
        sorter: (a, b) => a.up + a.down - (b.up + b.down),
        render: (_, record) => {
          const used = record.up + record.down;
          return (
            <Popover content={`↑ ${SizeFormatter.sizeFormat(record.up)} / ↓ ${SizeFormatter.sizeFormat(record.down)}`}>
              <Tag color={record.total > 0 ? ColorUtils.usageColor(used, record.total) : 'default'}>
                {SizeFormatter.sizeFormat(used)} / {record.total > 0 ? SizeFormatter.sizeFormat(record.total) : '∞'}
              </Tag>
            </Popover>
          );
        },
      },
      {
        title: t('pages.inbounds.totalUsage'),
        key: 'totalUsage',
        align: 'center',
        width: 120,
        render: (_, record) => <Tag>{SizeFormatter.sizeFormat(record.up + record.down)}</Tag>,
      },
      {
        title: t('pages.inbounds.expireDate'),
        key: 'expiryTime',
        align: 'center',
        width: 112,
        render: (_, record) => {
          if (record.expiryTime <= 0) return <InfinityIcon />;
          return (
            <Popover content={IntlUtil.formatDate(record.expiryTime, datepicker)}>
              <Tag color={ColorUtils.usageColor(Date.now(), expireDiff, record._expiryTime)}>
                {IntlUtil.formatRelativeTime(record.expiryTime)}
              </Tag>
            </Popover>
          );
        },
      },
    );

    return cols;
  }, [
    t,
    datepicker,
    hasAnyRemark,
    hostRemarksByInboundId,
    clientCount,
    subEnable,
    expireDiff,
    onRowAction,
    onSwitchEnable,
  ]);
}
