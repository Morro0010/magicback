import {
  compareOpaqueToken,
  generateOpaqueToken,
  hashOpaqueToken,
} from './security.util';

describe('security.util', () => {
  it('generates unique random opaque tokens', () => {
    const tokenA = generateOpaqueToken(32);
    const tokenB = generateOpaqueToken(32);

    expect(tokenA).not.toEqual(tokenB);
    expect(tokenA.length).toBeGreaterThan(20);
  });

  it('hashes and compares opaque tokens', () => {
    const token = generateOpaqueToken(16);
    const hash = hashOpaqueToken(token);

    expect(hash).toHaveLength(64);
    expect(compareOpaqueToken(token, hash)).toBe(true);
    expect(compareOpaqueToken('invalid-token', hash)).toBe(false);
  });
});
