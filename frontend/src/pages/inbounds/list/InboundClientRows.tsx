import { useMemo } from 'react';
import { Button, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import {
  EditOutlined,
  InfoCircleOutlined,
  QrcodeOutlined,
  RetweetOutlined,
} from '@ant-design/icons';

import { SizeFormatter, IntlUtil } from '@/utils';
import { coerceInboundJsonField } from '@/models/dbinbound';
import type {
  ClientCountEntry,
  ClientRowAction,
  DBInboundRecord,
} from './types';

interface CompactClient {
  key: string;
  email: string;
  comment: string;
  enable: boolean;
  online: boolean;
  up: number;
  down: number;
  total: number;
  expiryTime: number;
}

interface Props {
  record: DBInboundRecord;
  rollup?: ClientCountEntry;
  onAction: (action: {
    key: ClientRowAction;
    dbInbound: DBInboundRecord;
    email: string;
  }) => void;
  onEnable: (email: string, enable: boolean) => Promise<void>;
}

export default function InboundClientRows({ record, rollup, onAction, onEnable }: Props) {
  const rows = useMemo<CompactClient[]>(() => {
    const settings = coerceInboundJsonField(record.settings) as {
      clients?: Array<{ email?: string; enable?: boolean; comment?: string }>;
    };
    const statsByEmail = new Map(
      (record.clientStats || []).filter((s) => s?.email).map((s) => [s.email.toLowerCase(), s]),
    );
    const online = new Set((rollup?.online || []).map((email) => email.toLowerCase()));
    return (settings.clients || [])
      .filter((client): client is { email: string; enable?: boolean; comment?: string } =>
        Boolean(client?.email),
      )
      .map((client) => {
        const stats = statsByEmail.get(client.email.toLowerCase());
        return {
          key: client.email,
          email: client.email,
          comment: client.comment || '',
          enable: client.enable !== false,
          online: online.has(client.email.toLowerCase()),
          up: stats?.up || 0,
          down: stats?.down || 0,
          total: stats?.total || 0,
          expiryTime: stats?.expiryTime || 0,
        };
      });
  }, [record, rollup]);

  const columns = useMemo<TableColumnsType<CompactClient>>(
    () => [
      {
        title: '菜单',
        key: 'actions',
        width: 150,
        render: (_, client) => (
          <Space size={0}>
            <Tooltip title="二维码 / 链接">
              <Button
                type="text"
                size="small"
                icon={<QrcodeOutlined />}
                onClick={() => onAction({ key: 'qrcode', dbInbound: record, email: client.email })}
              />
            </Tooltip>
            <Tooltip title="编辑客户端">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onAction({ key: 'manage', dbInbound: record, email: client.email })}
              />
            </Tooltip>
            <Tooltip title="客户端信息">
              <Button
                type="text"
                size="small"
                icon={<InfoCircleOutlined />}
                onClick={() => onAction({ key: 'info', dbInbound: record, email: client.email })}
              />
            </Tooltip>
            <Tooltip title="重置流量">
              <Button
                type="text"
                size="small"
                icon={<RetweetOutlined />}
                onClick={() =>
                  onAction({ key: 'resetTraffic', dbInbound: record, email: client.email })
                }
              />
            </Tooltip>
          </Space>
        ),
      },
      {
        title: '启用',
        key: 'enable',
        width: 78,
        align: 'center',
        render: (_, client) => (
          <Switch
            size="small"
            checked={client.enable}
            onChange={(next) => void onEnable(client.email, next)}
          />
        ),
      },
      {
        title: '在线',
        key: 'online',
        width: 86,
        align: 'center',
        render: (_, client) =>
          client.online ? <Tag color="green">在线</Tag> : <Tag>离线</Tag>,
      },
      {
        title: '客户端',
        key: 'client',
        width: 230,
        render: (_, client) => (
          <div>
            <Typography.Text>{client.email}</Typography.Text>
            {client.comment && (
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                {client.comment}
              </Typography.Text>
            )}
          </div>
        ),
      },
      {
        title: '流量',
        key: 'traffic',
        width: 180,
        align: 'center',
        render: (_, client) => {
          const used = client.up + client.down;
          return (
            <span>
              {SizeFormatter.sizeFormat(used)} /{' '}
              {client.total > 0 ? SizeFormatter.sizeFormat(client.total) : '∞'}
            </span>
          );
        },
      },
      {
        title: '累计总流量',
        key: 'totalTraffic',
        width: 130,
        align: 'center',
        render: (_, client) => <Tag>{SizeFormatter.sizeFormat(client.up + client.down)}</Tag>,
      },
      {
        title: '到期时间',
        key: 'expiry',
        width: 150,
        align: 'center',
        render: (_, client) =>
          client.expiryTime > 0 ? (
            <Tooltip title={new Date(client.expiryTime).toLocaleString()}>
              <Tag>{IntlUtil.formatRelativeTime(client.expiryTime)}</Tag>
            </Tooltip>
          ) : (
            <Tag>∞</Tag>
          ),
      },
    ],
    [onAction, onEnable, record],
  );

  if (rows.length === 0) return null;

  return (
    <Table
      className="inbound-client-table"
      columns={columns}
      dataSource={rows}
      rowKey="email"
      pagination={false}
      size="small"
      showHeader
      scroll={{ x: 1000 }}
    />
  );
}
