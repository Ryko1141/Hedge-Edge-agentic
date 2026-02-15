/**
 * Integration Tests for Named Pipe Client (cTrader)
 * 
 * These tests verify the Named Pipe client and AgentChannelReader integration
 * for cTrader communication.
 * 
 * To run these tests manually:
 * 1. Start the cTrader cBot with HedgeEdge license
 * 2. Run: npx ts-node electron/__tests__/named-pipe-client.test.ts
 */

import { 
  NamedPipeClient,
  createNamedPipeClient,
  createNamedPipeClientForInstance,
  isCTraderPipeAvailable,
  DEFAULT_NAMED_PIPE_CONFIG,
  CTraderSnapshot,
} from '../named-pipe-client.js';

import {
  AgentChannelReader,
  AgentSnapshot,
} from '../agent-channel-reader.js';

// ============================================================================
// Test Utilities
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - start,
    });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    });
    console.log(`❌ ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// ============================================================================
// Unit Tests (No cBot Required)
// ============================================================================

async function testNamedPipeClientCreation(): Promise<void> {
  const client = createNamedPipeClient();
  assert(client !== null, 'Client should be created');
  
  const status = client.getStatus();
  assert(status.dataPipe === 'disconnected', 'Data pipe should start disconnected');
  assert(status.commandPipe === 'disconnected', 'Command pipe should start disconnected');
  assert(status.messagesReceived === 0, 'Messages received should be 0');
  assert(status.commandsSent === 0, 'Commands sent should be 0');
}

async function testNamedPipeClientWithInstance(): Promise<void> {
  const client = createNamedPipeClientForInstance('test_instance');
  assert(client !== null, 'Client should be created with instance ID');
}

async function testDefaultConfig(): Promise<void> {
  assert(DEFAULT_NAMED_PIPE_CONFIG.dataPipeName === '\\\\.\\pipe\\HedgeEdgeCTrader', 
    'Default data pipe name should be correct');
  assert(DEFAULT_NAMED_PIPE_CONFIG.commandPipeName === '\\\\.\\pipe\\HedgeEdgeCTrader_Commands', 
    'Default command pipe name should be correct');
  assert(DEFAULT_NAMED_PIPE_CONFIG.reconnectIntervalMs === 5000, 
    'Default reconnect interval should be 5000ms');
}

async function testAgentChannelReaderCreation(): Promise<void> {
  const reader = new AgentChannelReader();
  assert(reader !== null, 'Reader should be created');
  
  const terminals = reader.getRegisteredTerminals();
  assert(terminals.length === 0, 'Should have no registered terminals initially');
}

async function testAgentChannelReaderMT5Registration(): Promise<void> {
  const reader = new AgentChannelReader();
  
  reader.registerMT5Terminal('test-mt5', 'C:\\Users\\Test\\AppData\\Roaming\\MetaQuotes\\Terminal\\DATA');
  
  const mode = reader.getTerminalMode('test-mt5');
  assert(mode === 'file', 'Mode should be file for MT5');
  
  const platform = reader.getTerminalPlatform('test-mt5');
  assert(platform === 'MT5', 'Platform should be MT5');
  
  await reader.shutdown();
}

// ============================================================================
// Integration Tests (cBot Required)
// ============================================================================

async function testCTraderPipeAvailability(): Promise<void> {
  const available = await isCTraderPipeAvailable();
  console.log(`  cTrader pipe available: ${available}`);
  // This test just logs - doesn't fail if cBot not running
}

async function testCTraderRegistration(): Promise<void> {
  const reader = new AgentChannelReader();
  
  // This will try to connect but gracefully handle if cBot isn't running
  const registered = await reader.registerCTraderTerminal('test-ctrader');
  
  const mode = reader.getTerminalMode('test-ctrader');
  assert(mode === 'pipe', 'Mode should be pipe for cTrader');
  
  const platform = reader.getTerminalPlatform('test-ctrader');
  assert(platform === 'cTrader', 'Platform should be cTrader');
  
  const ctraderTerminals = reader.getCTraderTerminals();
  assert(ctraderTerminals.includes('test-ctrader'), 'Should include test-ctrader in cTrader terminals');
  
  await reader.shutdown();
}

async function testCTraderConnection(): Promise<void> {
  const available = await isCTraderPipeAvailable();
  if (!available) {
    console.log('  ⏭️ Skipping - cBot not running');
    return;
  }
  
  const client = createNamedPipeClient();
  
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      client.stop();
      reject(new Error('Connection timeout'));
    }, 10000);
    
    client.on('connected', () => {
      clearTimeout(timeout);
      console.log('  Connected to cTrader pipe');
    });
    
    client.on('snapshot', (snapshot: CTraderSnapshot) => {
      clearTimeout(timeout);
      console.log(`  Received snapshot: account=${snapshot.accountId}, balance=${snapshot.balance}`);
      client.stop();
      resolve();
    });
    
    client.on('error', (error: Error) => {
      // Don't fail on error during test - cBot might not be running
      console.log(`  Connection error (expected if cBot not running): ${error.message}`);
    });
    
    await client.start();
  });
}

async function testCTraderCommand(): Promise<void> {
  const available = await isCTraderPipeAvailable();
  if (!available) {
    console.log('  ⏭️ Skipping - cBot not running');
    return;
  }
  
  const reader = new AgentChannelReader();
  await reader.registerCTraderTerminal('cmd-test');
  
  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  if (!reader.isTerminalConnected('cmd-test')) {
    console.log('  ⏭️ Skipping - terminal not connected');
    await reader.shutdown();
    return;
  }
  
  // Send ping command
  const pong = await reader.ping('cmd-test');
  console.log(`  Ping result: ${pong}`);
  
  await reader.shutdown();
}

async function testMultipleCTraderInstances(): Promise<void> {
  const reader = new AgentChannelReader();
  
  // Register multiple cTrader instances
  await reader.registerCTraderTerminal('ctrader-1', { instanceId: '1' });
  await reader.registerCTraderTerminal('ctrader-2', { instanceId: '2' });
  
  const terminals = reader.getCTraderTerminals();
  assert(terminals.length === 2, 'Should have 2 cTrader terminals');
  assert(terminals.includes('ctrader-1'), 'Should include ctrader-1');
  assert(terminals.includes('ctrader-2'), 'Should include ctrader-2');
  
  await reader.shutdown();
}

async function testMixedPlatforms(): Promise<void> {
  const reader = new AgentChannelReader();
  
  // Register both MT5 and cTrader
  reader.registerMT5Terminal('mt5-1', 'C:\\Test\\MT5');
  await reader.registerCTraderTerminal('ctrader-1');
  
  const allTerminals = reader.getRegisteredTerminals();
  assert(allTerminals.length === 2, 'Should have 2 terminals');
  
  const mt5Terminals = reader.getMT5Terminals();
  assert(mt5Terminals.length === 1, 'Should have 1 MT5 terminal');
  
  const ctraderTerminals = reader.getCTraderTerminals();
  assert(ctraderTerminals.length === 1, 'Should have 1 cTrader terminal');
  
  await reader.shutdown();
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Named Pipe Client Integration Tests');
  console.log('='.repeat(60));
  console.log();
  
  console.log('Unit Tests:');
  console.log('-'.repeat(40));
  await runTest('NamedPipeClient creation', testNamedPipeClientCreation);
  await runTest('NamedPipeClient with instance ID', testNamedPipeClientWithInstance);
  await runTest('Default configuration', testDefaultConfig);
  await runTest('AgentChannelReader creation', testAgentChannelReaderCreation);
  await runTest('AgentChannelReader MT5 registration', testAgentChannelReaderMT5Registration);
  
  console.log();
  console.log('Integration Tests:');
  console.log('-'.repeat(40));
  await runTest('cTrader pipe availability', testCTraderPipeAvailability);
  await runTest('cTrader registration', testCTraderRegistration);
  await runTest('Multiple cTrader instances', testMultipleCTraderInstances);
  await runTest('Mixed platforms (MT5 + cTrader)', testMixedPlatforms);
  await runTest('cTrader connection', testCTraderConnection);
  await runTest('cTrader command', testCTraderCommand);
  
  console.log();
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  
  if (failed > 0) {
    console.log();
    console.log('Failed tests:');
    for (const result of results.filter(r => !r.passed)) {
      console.log(`  - ${result.name}: ${result.error}`);
    }
    process.exit(1);
  }
  
  console.log();
  console.log('All tests passed! ✅');
}

// Run if called directly
main().catch(console.error);
