import { useMemo, useState } from 'react';
import { Alert, Button, InputNumber, Modal, Space, Typography, message } from 'antd';

import { HttpUtil } from '@/utils';
import type { RealityScanResult } from '@/generated/types';
import {
  buildOneClickInboundPayload,
  pickOneClickPort,
  type OneClickInboundPreset,
  type OneClickRealityMaterial,
  type OneClickTlsMaterial,
} from '@/lib/xray/one-click-inbound';

interface Props {
  open: boolean;
  usedPorts: number[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

interface X25519Response {
  privateKey?: string;
  publicKey?: string;
}

interface VlessEncBlock {
  decryption: string;
  encryption: string;
  label?: string;
  id?: string;
}

function nativeX25519(auths: VlessEncBlock[]): VlessEncBlock | undefined {
  return auths.find((block) => {
    if (block.id === 'x25519') return true;
    const label = (block.label || '').toLowerCase().replace(/[-_\s]/g, '');
    return label.includes('x25519') && !label.includes('xorpub') && !label.includes('random');
  });
}

export default function OneClickInboundModal({ open, usedPorts, onClose, onCreated }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [creating, setCreating] = useState<OneClickInboundPreset | null>(null);
  const [messageApi, messageContextHolder] = message.useMessage();
  const used = useMemo(() => new Set(usedPorts), [usedPorts]);

  async function getRealityBase(): Promise<Omit<OneClickRealityMaterial, 'privateKey' | 'publicKey'> | null> {
    const scan = await HttpUtil.post<RealityScanResult[]>(
      '/panel/api/server/scanRealityTargets',
      {},
      { silent: true },
    );
    if (!scan?.success || !Array.isArray(scan.obj)) return null;
    const candidate = scan.obj.find(
      (item) =>
        item.feasible &&
        !item.privateTarget &&
        !!item.target &&
        Array.isArray(item.serverNames) &&
        item.serverNames.length > 0,
    );
    if (!candidate) return null;
    return { target: candidate.target, serverNames: candidate.serverNames };
  }

  async function getRealityMaterial(
    base: Omit<OneClickRealityMaterial, 'privateKey' | 'publicKey'>,
  ): Promise<OneClickRealityMaterial | null> {
    const cert = await HttpUtil.get('/panel/api/server/getNewX25519Cert', undefined, {
      silent: true,
    });
    if (!cert?.success || !cert.obj) return null;
    const keys = cert.obj as X25519Response;
    if (!keys.privateKey || !keys.publicKey) return null;
    return { ...base, privateKey: keys.privateKey, publicKey: keys.publicKey };
  }

  async function getTlsBase(): Promise<Omit<OneClickTlsMaterial, 'decryption' | 'encryption'> | null> {
    const settings = await HttpUtil.post('/panel/api/setting/all', undefined, { silent: true });
    if (!settings?.success || !settings.obj) return null;
    const obj = settings.obj as {
      webCertFile?: string;
      webKeyFile?: string;
      webDomain?: string;
      subDomain?: string;
    };
    const serverName =
      (obj.webDomain || obj.subDomain || window.location.hostname || '').trim();
    if (!obj.webCertFile || !obj.webKeyFile || !serverName) return null;
    return {
      certificateFile: obj.webCertFile,
      keyFile: obj.webKeyFile,
      serverName,
    };
  }

  async function getVlessEncryption(): Promise<Pick<OneClickTlsMaterial, 'decryption' | 'encryption'> | null> {
    const msg = await HttpUtil.get('/panel/api/server/getNewVlessEnc', undefined, { silent: true });
    if (!msg?.success || !msg.obj) return null;
    const block = nativeX25519(
      ((msg.obj as { auths?: VlessEncBlock[] }).auths || []),
    );
    return block ? { decryption: block.decryption, encryption: block.encryption } : null;
  }

  async function createPreset(preset: OneClickInboundPreset) {
    if (creating) return;
    setCreating(preset);
    try {
      const count = Math.max(1, Math.min(10, Number(quantity) || 1));
      let realityBase: Omit<OneClickRealityMaterial, 'privateKey' | 'publicKey'> | null = null;
      let tlsBase: Omit<OneClickTlsMaterial, 'decryption' | 'encryption'> | null = null;

      if (preset === 'vless-reality-vision' || preset === 'vless-xhttp-reality') {
        realityBase = await getRealityBase();
        if (!realityBase) {
          messageApi.error('没有找到可用的 Reality 伪装目标，请稍后重试或手动创建。');
          return;
        }
      } else {
        tlsBase = await getTlsBase();
        if (!tlsBase) {
          messageApi.error('面板尚未配置可用 TLS 证书，请先在面板设置中配置证书。');
          return;
        }
      }

      const localUsed = new Set(used);
      let ok = 0;
      let failed = 0;
      let firstError = '';

      for (let i = 1; i <= count; i++) {
        try {
          const port = pickOneClickPort(localUsed);
          let payload;
          if (realityBase) {
            const reality = await getRealityMaterial(realityBase);
            if (!reality) throw new Error('生成 X25519 密钥失败');
            payload = buildOneClickInboundPayload({ preset, port, index: i, reality });
          } else {
            const enc = await getVlessEncryption();
            if (!enc || !tlsBase) throw new Error('生成 VLESS Encryption 密钥失败');
            const tls: OneClickTlsMaterial = { ...tlsBase, ...enc };
            payload = buildOneClickInboundPayload({ preset, port, index: i, tls });
          }
          const result = await HttpUtil.post('/panel/api/inbounds/add', payload, {
            silentSuccess: true,
          });
          if (!result?.success) throw new Error(result?.msg || '创建失败');
          ok++;
        } catch (err) {
          failed++;
          if (!firstError) firstError = err instanceof Error ? err.message : String(err);
        }
      }

      if (ok > 0) await onCreated();
      if (failed === 0) {
        messageApi.success(`已一键创建 ${ok} 条入站。`);
        onClose();
      } else {
        messageApi.warning(
          `已创建 ${ok} 条，失败 ${failed} 条${firstError ? `：${firstError}` : ''}`,
        );
      }
    } finally {
      setCreating(null);
    }
  }

  const blockStyle = { width: '100%', height: 54, fontSize: 17 };

  return (
    <>
      {messageContextHolder}
      <Modal
        open={open}
        title="⚡ 一键配置"
        footer={null}
        width={620}
        onCancel={onClose}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="选择常用协议组合快速创建入站"
            description="每条自动生成随机端口和一个客户端；Reality 自动选择可用伪装目标并生成 X25519 密钥。"
          />

          <Space align="center">
            <Typography.Text>创建数量</Typography.Text>
            <InputNumber
              min={1}
              max={10}
              value={quantity}
              disabled={!!creating}
              onChange={(v) => setQuantity(Math.max(1, Math.min(10, Number(v) || 1)))}
            />
          </Space>

          <Button
            type="primary"
            style={blockStyle}
            loading={creating === 'vless-reality-vision'}
            disabled={!!creating && creating !== 'vless-reality-vision'}
            onClick={() => void createPreset('vless-reality-vision')}
          >
            🚀 VLESS + TCP + Reality + Vision
          </Button>

          <Button
            type="primary"
            style={blockStyle}
            loading={creating === 'vless-xhttp-reality'}
            disabled={!!creating && creating !== 'vless-xhttp-reality'}
            onClick={() => void createPreset('vless-xhttp-reality')}
          >
            ⚡ VLESS + XHTTP + Reality
          </Button>

          <Button
            type="primary"
            style={blockStyle}
            loading={creating === 'vless-xhttp-tls-encryption'}
            disabled={!!creating && creating !== 'vless-xhttp-tls-encryption'}
            onClick={() => void createPreset('vless-xhttp-tls-encryption')}
          >
            🛡️ VLESS Encryption + XHTTP + TLS
          </Button>

          <Typography.Text type="secondary">
            TLS 预设会使用“面板设置”中的证书文件；未配置证书时不会创建错误入站。
          </Typography.Text>
        </Space>
      </Modal>
    </>
  );
}
