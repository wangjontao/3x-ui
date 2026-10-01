import { RandomUtil } from '@/utils';
import { rawInboundToFormValues, formValuesToWirePayload } from '@/lib/xray/inbound-form-adapter';
import {
  createDefaultVlessClient,
  createDefaultVlessInboundSettings,
  type VlessClientSeed,
} from '@/lib/xray/inbound-defaults';
import { InboundFormSchema } from '@/schemas/forms/inbound-form';
import { RealityStreamSettingsSchema } from '@/schemas/protocols/security/reality';
import { TlsStreamSettingsSchema } from '@/schemas/protocols/security/tls';
import { TcpStreamSettingsSchema } from '@/schemas/protocols/stream/tcp';
import { XHttpStreamSettingsSchema } from '@/schemas/protocols/stream/xhttp';
import { SniffingSchema } from '@/schemas/primitives/sniffing';

export type OneClickInboundPreset =
  | 'vless-reality-vision'
  | 'vless-xhttp-reality'
  | 'vless-xhttp-tls-encryption';

export interface OneClickRealityMaterial {
  target: string;
  serverNames: string[];
  privateKey: string;
  publicKey: string;
}

export interface OneClickTlsMaterial {
  certificateFile: string;
  keyFile: string;
  serverName: string;
  decryption: string;
  encryption: string;
}

export interface BuildOneClickInboundOptions {
  preset: OneClickInboundPreset;
  port: number;
  index?: number;
  reality?: OneClickRealityMaterial;
  tls?: OneClickTlsMaterial;
}

export function pickOneClickPort(used: Set<number>): number {
  for (let i = 0; i < 64; i++) {
    const port = RandomUtil.randomInteger(10000, 60000);
    if (!used.has(port)) {
      used.add(port);
      return port;
    }
  }
  for (let port = 10000; port <= 60000; port++) {
    if (!used.has(port)) {
      used.add(port);
      return port;
    }
  }
  throw new Error('no free port');
}

function randomPath(): string {
  return `/${RandomUtil.randomLowerAndNum(10)}`;
}

function oneClickUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const hex = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return hex.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function oneClickClient(flow: VlessClientSeed['flow'] = '') {
  return createDefaultVlessClient({
    id: oneClickUuid(),
    email: RandomUtil.randomLowerAndNum(10),
    subId: RandomUtil.randomLowerAndNum(16),
    flow,
  });
}

function realitySettings(material: OneClickRealityMaterial) {
  const serverNames = material.serverNames.filter(Boolean);
  if (!material.target || !material.privateKey || !material.publicKey || serverNames.length === 0) {
    throw new Error('incomplete Reality material');
  }
  return RealityStreamSettingsSchema.parse({
    target: material.target,
    serverNames,
    privateKey: material.privateKey,
    shortIds: RandomUtil.randomShortIds()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    settings: {
      publicKey: material.publicKey,
      fingerprint: 'chrome',
      serverName: serverNames[0],
      spiderX: randomPath(),
    },
  });
}

function tlsSettings(material: OneClickTlsMaterial) {
  if (!material.certificateFile || !material.keyFile || !material.serverName) {
    throw new Error('incomplete TLS material');
  }
  return TlsStreamSettingsSchema.parse({
    serverName: material.serverName,
    certificates: [
      {
        certificateFile: material.certificateFile,
        keyFile: material.keyFile,
        ocspStapling: 0,
        oneTimeLoading: false,
        usage: 'encipherment',
        buildChain: false,
      },
    ],
    settings: {
      fingerprint: 'chrome',
      echConfigList: '',
      pinnedPeerCertSha256: [],
      verifyPeerCertByName: '',
    },
  });
}

export function buildOneClickInboundPayload({
  preset,
  port,
  index = 1,
  reality,
  tls,
}: BuildOneClickInboundOptions) {
  const settings = createDefaultVlessInboundSettings();
  let streamSettings: Record<string, unknown>;
  let remark = '';

  if (preset === 'vless-reality-vision') {
    if (!reality) throw new Error('Reality material required');
    settings.clients = [oneClickClient('xtls-rprx-vision')];
    streamSettings = {
      network: 'tcp',
      security: 'reality',
      tcpSettings: TcpStreamSettingsSchema.parse({ header: { type: 'none' } }),
      realitySettings: realitySettings(reality),
    };
    remark = `JuLiang-Reality-Vision-${index}`;
  } else if (preset === 'vless-xhttp-reality') {
    if (!reality) throw new Error('Reality material required');
    settings.clients = [oneClickClient()];
    streamSettings = {
      network: 'xhttp',
      security: 'reality',
      xhttpSettings: XHttpStreamSettingsSchema.parse({ path: randomPath() }),
      realitySettings: realitySettings(reality),
    };
    remark = `JuLiang-XHTTP-Reality-${index}`;
  } else {
    if (!tls) throw new Error('TLS material required');
    settings.clients = [oneClickClient()];
    settings.decryption = tls.decryption || 'none';
    settings.encryption = tls.encryption || 'none';
    streamSettings = {
      network: 'xhttp',
      security: 'tls',
      xhttpSettings: XHttpStreamSettingsSchema.parse({ path: randomPath() }),
      tlsSettings: tlsSettings(tls),
    };
    remark = `JuLiang-XHTTP-TLS-${index}`;
  }

  const values = rawInboundToFormValues({
    protocol: 'vless',
    settings,
    streamSettings,
    sniffing: SniffingSchema.parse({}),
    port,
    listen: '',
    tag: '',
    enable: true,
    remark,
    trafficReset: 'never',
    shareAddrStrategy: 'listen',
    shareAddr: '',
    total: 0,
    expiryTime: 0,
  });

  const parsed = InboundFormSchema.safeParse(values);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return formValuesToWirePayload(parsed.data);
}
