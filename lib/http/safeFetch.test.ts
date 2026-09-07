import { describe, it, expect } from 'vitest';
import { isBlockedIpv4, isBlockedIpv6, isBlockedAddress } from './safeFetch';

describe('isBlockedIpv4', () => {
  it('blocks private / loopback / link-local / metadata', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '0.0.0.0',
      '100.64.0.1', // CGNAT
      '224.0.0.1', // multicast
    ]) {
      expect(isBlockedIpv4(ip), ip).toBe(true);
    }
  });

  it('allows normal public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '151.101.0.81']) {
      expect(isBlockedIpv4(ip), ip).toBe(false);
    }
  });

  it('blocks malformed input', () => {
    expect(isBlockedIpv4('999.1.1.1')).toBe(true);
    expect(isBlockedIpv4('nope')).toBe(true);
  });
});

describe('isBlockedIpv6', () => {
  it('blocks loopback / link-local / ULA / mapped-private', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1']) {
      expect(isBlockedIpv6(ip), ip).toBe(true);
    }
  });

  it('allows public v6 and mapped-public v4', () => {
    expect(isBlockedIpv6('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedIpv6('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('isBlockedAddress', () => {
  it('routes by family', () => {
    expect(isBlockedAddress('10.0.0.1', 4)).toBe(true);
    expect(isBlockedAddress('fc00::1', 6)).toBe(true);
    expect(isBlockedAddress('8.8.8.8', 4)).toBe(false);
  });
});
