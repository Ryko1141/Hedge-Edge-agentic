import '@testing-library/jest-dom';

// Mock Electron API bridge
const mockElectronAPI = {
    safeStorage: {
        encrypt: vi.fn().mockResolvedValue(true),
        decrypt: vi.fn().mockResolvedValue(null),
    },
    license: {
        validate: vi.fn().mockResolvedValue({ valid: true }),
        activate: vi.fn().mockResolvedValue({ success: true }),
    },
    metaapi: {
        listAccounts: vi.fn().mockResolvedValue([]),
    },
    updater: {
        getVersion: vi.fn().mockResolvedValue('1.0.0'),
    },
    openExternal: vi.fn(),
};

Object.defineProperty(window, 'electronAPI', {
    value: mockElectronAPI,
    writable: true,
});

// Mock import.meta.env
vi.stubEnv('MODE', 'test');
