import { describe, expect, test } from 'vitest';

import {
  buildOneClickInboundPayload,
  type OneClickRealityMaterial,
  type OneClickTlsMaterial,
} from '@/lib/xray/one-click-inbound';

const reality: OneClickRealityMaterial = {
  target: 'www.microsoft.com:443',
  serverNames: ['www.microsoft.com'],
  privateKey: 'private-key',
  publicKey: 'public-key',
};

const tls: OneClickTlsMaterial = {
  certificateFile: '/etc/ssl/cert.pem',
  keyFile: '/etc/ssl/key.pem',
  serverName: 'example.com',
  decryption: 'enc-decrypt',
  encryption: 'enc-encrypt',
};

describe('JuLiang one-click inbound presets', () => {
  test('builds VLESS TCP Reality Vision with one client', () => {
    const payload = buildOneClickInboundPayload({
      preset: 'vless-reality-vision',
      port: 25001,
      reality,
    });
    const settings = JSON.parse(payload.settings);
    const stream = JSON.parse(payload.streamSettings);
    expect(payload.protocol).toBe('vless');
    expect(payload.port).toBe(25001);
    expect(settings.clients).toHaveLength(1);
    expect(settings.clients[0].flow).toBe('xtls-rprx-vision');
    expect(stream.network).toBe('tcp');
    expect(stream.security).toBe('reality');
    expect(stream.realitySettings.target).toBe('www.microsoft.com:443');
  });

  test('builds VLESS XHTTP Reality', () => {
    const payload = buildOneClickInboundPayload({
      preset: 'vless-xhttp-reality',
      port: 25002,
      reality,
    });
    const stream = JSON.parse(payload.streamSettings);
    expect(stream.network).toBe('xhttp');
    expect(stream.security).toBe('reality');
    expect(stream.xhttpSettings.path).toMatch(/^\//);
  });

  test('builds VLESS Encryption XHTTP TLS with panel cert', () => {
    const payload = buildOneClickInboundPayload({
      preset: 'vless-xhttp-tls-encryption',
      port: 25003,
      tls,
    });
    const settings = JSON.parse(payload.settings);
    const stream = JSON.parse(payload.streamSettings);
    expect(settings.clients).toHaveLength(1);
    expect(settings.encryption).toBe('enc-encrypt');
    expect(settings.decryption).toBe('enc-decrypt');
    expect(stream.network).toBe('xhttp');
    expect(stream.security).toBe('tls');
    expect(stream.tlsSettings.serverName).toBe('example.com');
    expect(stream.tlsSettings.certificates[0].certificateFile).toBe('/etc/ssl/cert.pem');
  });
});
