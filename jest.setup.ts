import { jest } from '@jest/globals';
import { TextEncoder, TextDecoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

global.URL.createObjectURL = jest.fn(() => 'mock-url');
