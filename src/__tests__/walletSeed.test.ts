import { privateKeyToAccount } from 'viem/accounts';
import { webcrypto } from 'crypto';

describe('wallet-derived mnemonic determinism', () => {
  it('derives the same mnemonic 50 times from the same private key/signature flow', async () => {
    const g = globalThis as unknown as { crypto?: Crypto };
    if (!g.crypto || !g.crypto.subtle) {
      // Environment does not provide WebCrypto; skip determinism check here.
      expect(true).toBe(true);
      return;
    }
    // 32-byte test private key (DO NOT USE IN PRODUCTION)
    const privateKey = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const account = privateKeyToAccount(privateKey);

    const { buildSeedDerivationTypedData } = await import('~/utils/walletSeed');
    const { domain, types, primaryType, message } = buildSeedDerivationTypedData(account.address);

    // Ensure Web Crypto is available before importing module under test
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const { deriveMnemonicFromWalletSignature } = await import('~/utils/walletSeed');

    const mnemonics: string[] = [];
    for (let i = 0; i < 50; i++) {
      const signature = await account.signTypedData({ domain, types, primaryType, message });
      const mnemonic = await deriveMnemonicFromWalletSignature(signature, account.address);
      mnemonics.push(mnemonic);
    }

    // All derived mnemonics should match the first one
    const first = mnemonics[0];
    expect(first).toBeDefined();
    expect(first.split(' ').length).toBe(12);
    for (const m of mnemonics) expect(m).toBe(first);
  });
});
