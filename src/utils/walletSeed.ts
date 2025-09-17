'use client';

// Signature-based seed derivation aligned with sigfuture.md.
// - EIP-712 signing payload must commit to the address hash (keccak256(A_secret)).
// - Derivation uses HKDF-Extract with IKM = r (from signature) and salt = A_secret (address bytes).
// - HKDF-Expand (via HKDF info) with appId to produce 16 bytes for a 12-word mnemonic.

import { keccak256, toBytes } from 'viem';
import { english } from 'viem/accounts';

const textEncoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error('Invalid hex');
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function sha256(data: ArrayBuffer): Promise<Uint8Array> {
  const g = globalThis as unknown as { crypto?: Crypto };
  const subtle: SubtleCrypto | undefined = g.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', data);
    return new Uint8Array(digest);
  }
  try {
    const nodeCrypto = (await import('crypto')) as typeof import('crypto');
    const hash = nodeCrypto.createHash('sha256');
    hash.update(Buffer.from(data));
    return new Uint8Array(hash.digest());
  } catch {
    throw new Error('SHA-256 not available');
  }
}

async function hkdf(ikm: ArrayBuffer, salt: ArrayBuffer, info: ArrayBuffer, length = 32): Promise<Uint8Array> {
  const g = globalThis as unknown as { crypto?: Crypto };
  const subtle: SubtleCrypto | undefined = g.crypto?.subtle;
  if (subtle) {
    const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
    return new Uint8Array(bits);
  }
  try {
    const nodeCrypto = (await import('crypto')) as typeof import('crypto');
    const out = nodeCrypto.hkdfSync('sha256', Buffer.from(ikm), Buffer.from(salt), Buffer.from(info), length);
    return new Uint8Array(out);
  } catch {
    throw new Error('HKDF not available');
  }
}

// Minimal BIP39 entropy -> mnemonic (English) implementation
async function mnemonicFromEntropy(entropy: Uint8Array): Promise<string> {
  const ENT = entropy.length * 8;
  const CS = ENT / 32;
  const hash = await sha256(entropy.buffer);
  // Build bitstring of entropy + checksum
  const bits = bytesToBits(entropy) + bytesToBits(hash).slice(0, CS);
  const words: string[] = [];
  for (let i = 0; i < bits.length; i += 11) {
    const chunk = bits.slice(i, i + 11);
    if (chunk.length < 11) break;
    const idx = parseInt(chunk, 2);
    words.push(english[idx]);
  }
  return words.join(' ');
}

function bytesToBits(bytes: Uint8Array): string {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  return bits;
}

export async function deriveMnemonicFromWalletSignature(signatureHex: string, address: string): Promise<string> {
  // Decode signature and extract r (first 32 bytes)
  const sig = hexToBytes(signatureHex);
  if (sig.length < 65) throw new Error('Invalid signature length');
  const r = sig.slice(0, 32); // IKM for HKDF-Extract

  // Salt is the raw address bytes (A_secret)
  const addr = address.toLowerCase();
  const addrBytes = hexToBytes(addr);

  // appId (HKDF info) binds derivation to this app/version
  const info = textEncoder.encode('privacy-pools/wallet-seed:v1');

  // Single HKDF call (Extract+Expand): IKM=r, salt=A_secret, info=appId, len=16 bytes
  const entropy = await hkdf(r.buffer, addrBytes.buffer, info.buffer, 16);
  const mnemonic = await mnemonicFromEntropy(entropy);
  return mnemonic;
}

// Build the EIP-712 typed data for seed derivation, committing to keccak256(address).
export function buildSeedDerivationTypedData(address: string) {
  const addrBytes = toBytes(address as `0x${string}`);
  const addressHash = keccak256(addrBytes);
  const domain = { name: 'Privacy Pools', version: '1' } as const;
  const types = {
    DeriveSeed: [
      { name: 'action', type: 'string' },
      { name: 'context', type: 'string' },
      { name: 'addressHash', type: 'bytes32' },
    ],
  } as const;
  const message = {
    action: 'Derive Account Seed',
    context: 'privacy-pools/wallet-seed:v1',
    addressHash: addressHash as `0x${string}`,
  } as const;
  return { domain, types, message, primaryType: 'DeriveSeed' as const };
}
